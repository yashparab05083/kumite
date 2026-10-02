use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use serde_json::{json, Value};
use std::{
    env,
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio_postgres::Client;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::{error, info};

const FALLBACK_B64: &str = "cG9zdGdyZXM6Ly9hdm5hZG1pbjpBVk5TX29XQ1Bvc3lweTRid1ZWVjFBV2hAc2hvdG9rYW4tdG91cm5hbWVudC15YXNocGFyYWIwNTA4LWQwYmEuYy5haXZlbmNsb3VkLmNvbToyNDI5Ni9kZWZhdWx0ZGI=";

fn get_database_uri() -> String {
    let mut uri = env::var("DATABASE_URL").unwrap_or_default();
    let trimmed = uri.trim();
    if trimmed.is_empty() || trimmed == "null" || trimmed == "undefined" {
        if let Ok(decoded) = BASE64.decode(FALLBACK_B64) {
            uri = String::from_utf8_lossy(&decoded).to_string();
        }
    }
    let cleaned = uri
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .split('?')
        .next()
        .unwrap_or("")
        .to_string();
    cleaned
}

enum DbCommand {
    GetState {
        respond_to: tokio::sync::oneshot::Sender<Result<Option<Value>, String>>,
    },
    SaveState {
        data: Value,
        respond_to: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    ResetState {
        respond_to: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    HealthCheck {
        respond_to: tokio::sync::oneshot::Sender<Result<String, String>>,
    },
}

#[derive(Clone)]
struct AppState {
    cache: Arc<RwLock<Option<Value>>>,
    version: Arc<AtomicU64>,
    db_tx: mpsc::Sender<DbCommand>,
    ws_broadcast: broadcast::Sender<String>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info,kumite_server=debug")
        .init();

    let db_uri = get_database_uri();
    info!("🚀 Kumite Tournament Rust (Axum + Tokio) Backend Initializing");
    info!("Database URI configured: {}", mask_uri(&db_uri));

    let (db_tx, db_rx) = mpsc::channel::<DbCommand>(100);
    let (ws_tx, _) = broadcast::channel::<String>(100);

    // Spawn dedicated DB worker thread
    let db_uri_clone = db_uri.clone();
    tokio::spawn(async move {
        db_worker_loop(db_uri_clone, db_rx).await;
    });

    let state = AppState {
        cache: Arc::new(RwLock::new(None)),
        version: Arc::new(AtomicU64::new(1)),
        db_tx,
        ws_broadcast: ws_tx,
    };

    // Warm up cache from Database on startup
    warmup_cache(&state).await;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let serve_dir = ServeDir::new(".")
        .not_found_service(ServeFile::new(PathBuf::from("index.html")));

    let app = Router::new()
        .route("/api/tournament", get(get_tournament).post(save_tournament))
        .route("/api/sync/tatamis", get(get_tatami_sync).post(save_tournament))
        .route("/api/reset", post(reset_tournament))
        .route("/api/health", get(health_check))
        .route("/ws", get(ws_handler))
        .fallback_service(serve_dir)
        .layer(CompressionLayer::new())
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse()
        .unwrap_or(3000);

    let addr = format!("0.0.0.0:{}", port);
    info!("🚀 Kumite Tournament Web Server & Aiven API running on port {}", port);
    info!("🌐 Website URL: http://localhost:{}", port);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind port");

    axum::serve(listener, app)
        .await
        .expect("Server runtime error");
}

fn mask_uri(uri: &str) -> String {
    if let Some(at_idx) = uri.find('@') {
        let prefix = &uri[..uri.find("://").map(|i| i + 3).unwrap_or(0)];
        let suffix = &uri[at_idx..];
        format!("{}****{}", prefix, suffix)
    } else {
        uri.to_string()
    }
}

async fn warmup_cache(state: &AppState) {
    let (tx, rx) = tokio::sync::oneshot::channel();
    if state.db_tx.send(DbCommand::GetState { respond_to: tx }).await.is_ok() {
        if let Ok(Ok(Some(data))) = rx.await {
            info!("Successfully pre-warmed in-memory RAM cache from Aiven PostgreSQL!");
            let mut w = state.cache.write().await;
            *w = Some(data);
        }
    }
}

// Database Connection & Management Loop
async fn db_worker_loop(db_uri: String, mut db_rx: mpsc::Receiver<DbCommand>) {
    loop {
        info!("Connecting to Aiven PostgreSQL...");
        match connect_db(&db_uri).await {
            Ok(client) => {
                info!("Successfully connected to Aiven PostgreSQL & initialized tournament_state table.");
                if let Err(e) = handle_db_commands(&client, &mut db_rx).await {
                    error!("Database worker encountered error: {}", e);
                }
            }
            Err(e) => {
                error!("Aiven PostgreSQL Connection Error: {}", e);
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        }
    }
}

async fn connect_db(db_uri: &str) -> Result<Client, String> {
    let tls_connector = TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| format!("TLS builder error: {}", e))?;
    let connector = MakeTlsConnector::new(tls_connector);

    let (client, connection) = tokio_postgres::connect(db_uri, connector)
        .await
        .map_err(|e| format!("Postgres connect error: {}", e))?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            error!("Postgres connection error: {}", e);
        }
    });

    client
        .execute(
            "CREATE TABLE IF NOT EXISTS tournament_state (
                id VARCHAR(50) PRIMARY KEY,
                state_data JSONB NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );",
            &[],
        )
        .await
        .map_err(|e| format!("Init table error: {}", e))?;

    Ok(client)
}

async fn handle_db_commands(client: &Client, db_rx: &mut mpsc::Receiver<DbCommand>) -> Result<(), String> {
    while let Some(cmd) = db_rx.recv().await {
        match cmd {
            DbCommand::GetState { respond_to } => {
                let res = client
                    .query_opt("SELECT state_data::text FROM tournament_state WHERE id = $1", &[&"main"])
                    .await
                    .map_err(|e| e.to_string())
                    .map(|row| {
                        row.and_then(|r| {
                            let json_str: String = r.get(0);
                            serde_json::from_str(&json_str).ok()
                        })
                    });
                let _ = respond_to.send(res);
            }
            DbCommand::SaveState { data, respond_to } => {
                let json_str = serde_json::to_string(&data).unwrap_or_default();
                let res = client
                    .execute(
                        "INSERT INTO tournament_state (id, state_data, updated_at)
                         VALUES ($1, $2::jsonb, NOW())
                         ON CONFLICT (id) DO UPDATE SET state_data = EXCLUDED.state_data, updated_at = NOW();",
                        &[&"main", &json_str],
                    )
                    .await
                    .map_err(|e| e.to_string())
                    .map(|_| ());
                let _ = respond_to.send(res);
            }
            DbCommand::ResetState { respond_to } => {
                let res = client
                    .execute("TRUNCATE TABLE tournament_state;", &[])
                    .await
                    .map_err(|e| e.to_string())
                    .map(|_| ());
                let _ = respond_to.send(res);
            }
            DbCommand::HealthCheck { respond_to } => {
                let res = client
                    .query_one("SELECT NOW()::text", &[])
                    .await
                    .map_err(|e| e.to_string())
                    .map(|row| row.get::<_, String>(0));
                let _ = respond_to.send(res);
            }
        }
    }
    Err("Channel closed".to_string())
}

// 1. GET /api/tournament - Instant RAM serving with ETag support
async fn get_tournament(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let current_version = state.version.load(Ordering::Relaxed);
    let etag = format!("\"v{}\"", current_version);

    if let Some(if_none_match) = headers.get(header::IF_NONE_MATCH) {
        if let Ok(val) = if_none_match.to_str() {
            if val == etag {
                return (StatusCode::NOT_MODIFIED, [("ETag", etag)]).into_response();
            }
        }
    }

    // Fast path: Check RAM cache
    {
        let r = state.cache.read().await;
        if let Some(ref cached_data) = *r {
            return (
                StatusCode::OK,
                [
                    ("Content-Type", "application/json"),
                    ("ETag", &etag),
                    ("Cache-Control", "no-cache"),
                ],
                Json(cached_data.clone()),
            )
                .into_response();
        }
    }

    // Slow path: Read from database
    let (tx, rx) = tokio::sync::oneshot::channel();
    if state.db_tx.send(DbCommand::GetState { respond_to: tx }).await.is_ok() {
        if let Ok(Ok(data_opt)) = rx.await {
            let data = data_opt.unwrap_or(Value::Null);
            let mut w = state.cache.write().await;
            *w = Some(data.clone());
            return (
                StatusCode::OK,
                [
                    ("Content-Type", "application/json"),
                    ("ETag", &etag),
                    ("Cache-Control", "no-cache"),
                ],
                Json(data),
            )
                .into_response();
        }
    }

    (
        StatusCode::OK,
        [("Content-Type", "application/json")],
        Json(Value::Null),
    )
        .into_response()
}

// 1b. GET /api/sync/tatamis - Lightweight Tatami & Bout assignment sync (<2KB payload)
async fn get_tatami_sync(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let current_version = state.version.load(Ordering::Relaxed);
    let etag = format!("\"tatami-v{}\"", current_version);

    if let Some(if_none_match) = headers.get(header::IF_NONE_MATCH) {
        if let Ok(val) = if_none_match.to_str() {
            if val == etag {
                return (StatusCode::NOT_MODIFIED, [("ETag", etag)]).into_response();
            }
        }
    }

    let r = state.cache.read().await;
    if let Some(ref cached_data) = *r {
        let tatamis = cached_data.get("tatamis").cloned().unwrap_or(json!([]));
        let empty_vec = vec![];
        let bouts_arr = cached_data.get("bouts").and_then(|b| b.as_array()).unwrap_or(&empty_vec);
        let light_bouts: Vec<Value> = bouts_arr.iter().map(|b| {
            json!({
                "id": b.get("id"),
                "boutName": b.get("boutName"),
                "tatamiId": b.get("tatamiId"),
                "status": b.get("status"),
                "eventType": b.get("eventType"),
                "ageCategory": b.get("ageCategory"),
                "gender": b.get("gender"),
                "beltTier": b.get("beltTier"),
                "lastUpdated": b.get("lastUpdated").unwrap_or(&json!(0))
            })
        }).collect();

        let light_state = json!({
            "tatamis": tatamis,
            "bouts": light_bouts,
            "lastUpdated": cached_data.get("lastUpdated").unwrap_or(&json!(0))
        });

        return (
            StatusCode::OK,
            [
                ("Content-Type", "application/json"),
                ("ETag", etag),
                ("Cache-Control", "no-cache"),
            ],
            Json(light_state),
        ).into_response();
    }

    (
        StatusCode::OK,
        [("Content-Type", "application/json")],
        Json(json!({ "tatamis": [], "bouts": [], "lastUpdated": 0 })),
    ).into_response()
}

// 2. POST /api/tournament - Save state to RAM & Database + Broadcast
async fn save_tournament(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> impl IntoResponse {
    // 1. Update in-memory RAM cache immediately for sub-millisecond local reads
    {
        let mut w = state.cache.write().await;
        *w = Some(payload.clone());
    }

    state.version.fetch_add(1, Ordering::Relaxed);

    // 2. Broadcast live WebSocket update to all connected screens/clients
    if let Ok(json_str) = serde_json::to_string(&payload) {
        let _ = state.ws_broadcast.send(json_str);
    }

    // 3. Dispatch async DB write
    let (tx, rx) = tokio::sync::oneshot::channel();
    let db_res = if state.db_tx.send(DbCommand::SaveState { data: payload, respond_to: tx }).await.is_ok() {
        rx.await.unwrap_or(Err("Database write timeout".to_string()))
    } else {
        Err("Database channel error".to_string())
    };

    match db_res {
        Ok(_) => Json(json!({
            "success": true,
            "message": "Tournament data saved to Aiven PostgreSQL!"
        })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        ).into_response(),
    }
}

// 3. POST /api/reset - Clear database state & RAM cache
async fn reset_tournament(State(state): State<AppState>) -> impl IntoResponse {
    {
        let mut w = state.cache.write().await;
        *w = None;
    }
    state.version.fetch_add(1, Ordering::Relaxed);
    let _ = state.ws_broadcast.send("RESET".to_string());

    let (tx, rx) = tokio::sync::oneshot::channel();
    let db_res = if state.db_tx.send(DbCommand::ResetState { respond_to: tx }).await.is_ok() {
        rx.await.unwrap_or(Err("Reset timeout".to_string()))
    } else {
        Err("Database channel error".to_string())
    };

    match db_res {
        Ok(_) => Json(json!({
            "success": true,
            "message": "Tournament database cleared successfully!"
        })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e })),
        ).into_response(),
    }
}

// Health check endpoint
async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let res = if state.db_tx.send(DbCommand::HealthCheck { respond_to: tx }).await.is_ok() {
        rx.await.unwrap_or(Err("Health check timeout".to_string()))
    } else {
        Err("Database disconnected".to_string())
    };

    match res {
        Ok(time) => Json(json!({
            "status": "OK",
            "database": "Connected",
            "serverTime": time
        })).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "status": "ERROR",
                "message": e
            })),
        ).into_response(),
    }
}

// Real-Time WebSocket Handler
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.ws_broadcast.subscribe();

    // Send initial state on connection
    {
        let cache_r = state.cache.read().await;
        if let Some(ref data) = *cache_r {
            if let Ok(msg_str) = serde_json::to_string(data) {
                let _ = socket.send(Message::Text(msg_str)).await;
            }
        }
    }

    loop {
        tokio::select! {
            result = rx.recv() => {
                match result {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
