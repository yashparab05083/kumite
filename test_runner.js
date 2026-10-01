/**
 * Comprehensive Multi-User Real-Time Sync & Persistence Test Suite
 * Tests 5 concurrent client roles (Organizer, Tatami 1, Tatami 2, Tatami 3 Kata, Spectator Screen)
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PORT = 3030;
const SERVER_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}/ws`;
const DATA_FILE = path.join(__dirname, 'tournament_data.json');

let serverProcess = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('1️⃣  Starting Kumite Backend Server...');
    serverProcess = cp.spawn('node', ['server.js'], { cwd: __dirname });

    serverProcess.stdout.on('data', data => {
      const out = data.toString();
      // console.log('[Server stdout]', out);
      if (out.includes(`running on port ${PORT}`)) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', data => {
      console.error('[Server stderr]', data.toString());
    });

    serverProcess.on('error', reject);

    setTimeout(() => {
      resolve(); // Fallback if output was buffered
    }, 7000);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGINT');
    serverProcess = null;
  }
}

async function postState(state) {
  const res = await fetch(`${SERVER_URL}/api/tournament`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state)
  });
  return res.json();
}

async function getState() {
  const res = await fetch(`${SERVER_URL}/api/tournament`);
  return res.json();
}

function createClientWebSocket(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const messages = [];

    ws.on('open', () => {
      resolve({ ws, messages });
    });

    ws.on('message', data => {
      if (data.toString() === 'RESET') {
        messages.push('RESET');
      } else {
        try {
          messages.push(JSON.parse(data.toString()));
        } catch(e) {}
      }
    });
  });
}

async function run() {
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName) {
    totalTests++;
    if (condition) {
      console.log(`   ✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`   ❌ FAIL: ${testName}`);
    }
  }

  try {
    await startServer();
    await sleep(500);

    // TEST 1: Health Endpoint Check
    console.log('\n2️⃣  Testing Server Health API...');
    const healthRes = await fetch(`${SERVER_URL}/api/health`);
    const health = await healthRes.json();
    assert(health.status === 'OK', 'Server /api/health returned OK status');
    assert(health.storage.includes('tournament_data.json'), 'Server uses local single-file persistence');

    // TEST 2: Multi-Client WebSocket Connections
    console.log('\n3️⃣  Connecting 5 Concurrent User Clients via WebSocket...');
    const organizerClient = await createClientWebSocket('Organizer');
    const tatami1Client = await createClientWebSocket('Tatami 1');
    const tatami2Client = await createClientWebSocket('Tatami 2');
    const tatami3Client = await createClientWebSocket('Tatami 3');
    const displayClient = await createClientWebSocket('Main Spectator Display');
    assert(organizerClient && tatami1Client && tatami2Client && tatami3Client && displayClient, 'All 5 user WebSockets connected simultaneously');

    // TEST 3: Organizer Uploads Tournament Data & Assigns Bouts
    console.log('\n4️⃣  Organizer uploads tournament with Kumite & Kata bouts...');
    const now = Date.now();
    const tournamentState = {
      tournamentInfo: {
        title: 'NATIONAL SHOTOKAN CHAMPIONSHIP 2026',
        date: '2026-10-01',
        referees: ['Sensei A', 'Sensei B', 'Sensei C', 'Sensei D', 'Sensei E']
      },
      bouts: [
        {
          id: 'bout_kumite_u12',
          boutName: 'Boys Kumite 10-11 Years',
          boutCode: 'KM-01',
          eventType: 'Kumite',
          ageCategory: '10-11 Years',
          gender: 'Male',
          beltTier: 'Intermediate',
          status: 'Assigned',
          tatamiId: 1,
          lastUpdated: now,
          participants: [
            { id: 'p1', name: 'Rohan Sharma', branch: 'Mumbai Dojo' },
            { id: 'p2', name: 'Aditya Patil', branch: 'Pune Dojo' }
          ]
        },
        {
          id: 'bout_kumite_u14',
          boutName: 'Cadet Kumite 12-13 Years',
          boutCode: 'KM-02',
          eventType: 'Kumite',
          ageCategory: '12-13 Years',
          gender: 'Male',
          beltTier: 'Advanced',
          status: 'Assigned',
          tatamiId: 2,
          lastUpdated: now,
          participants: [
            { id: 'p3', name: 'Vikram Singh', branch: 'Delhi Dojo' },
            { id: 'p4', name: 'Karan Mehta', branch: 'Nagpur Dojo' }
          ]
        },
        {
          id: 'bout_kata_open',
          boutName: 'Open Kata Championship',
          boutCode: 'KT-01',
          eventType: 'Kata',
          ageCategory: 'Open Senior',
          gender: 'Male',
          beltTier: 'Black Belt',
          status: 'Assigned',
          tatamiId: 3,
          lastUpdated: now,
          participants: [
            { id: 'p5', name: 'Rahul Joshi', branch: 'Goa Dojo' },
            { id: 'p6', name: 'Sameer Sen', branch: 'Kolkata Dojo' }
          ]
        }
      ],
      brackets: {
        'bout_kumite_u12': {
          boutId: 'bout_kumite_u12',
          boutName: 'Boys Kumite 10-11 Years',
          eventType: 'Kumite',
          tatamiId: 1,
          lastUpdated: now,
          matches: [
            {
              matchNumber: 1,
              aao: { id: 'p1', name: 'Rohan Sharma', branch: 'Mumbai Dojo' },
              aka: { id: 'p2', name: 'Aditya Patil', branch: 'Pune Dojo' },
              winner: null,
              loser: null,
              status: 'Scheduled',
              score: { aaoPoints: 0, akaPoints: 0 }
            }
          ]
        },
        'bout_kumite_u14': {
          boutId: 'bout_kumite_u14',
          boutName: 'Cadet Kumite 12-13 Years',
          eventType: 'Kumite',
          tatamiId: 2,
          lastUpdated: now,
          matches: [
            {
              matchNumber: 1,
              aao: { id: 'p3', name: 'Vikram Singh', branch: 'Delhi Dojo' },
              aka: { id: 'p4', name: 'Karan Mehta', branch: 'Nagpur Dojo' },
              winner: null,
              loser: null,
              status: 'Scheduled',
              score: { aaoPoints: 0, akaPoints: 0 }
            }
          ]
        },
        'bout_kata_open': {
          boutId: 'bout_kata_open',
          boutName: 'Open Kata Championship',
          eventType: 'Kata',
          tatamiId: 3,
          lastUpdated: now,
          competitors: [
            { id: 'p5', name: 'Rahul Joshi', scores: [0, 0, 0, 0, 0], totalScore: 0, place: null },
            { id: 'p6', name: 'Sameer Sen', scores: [0, 0, 0, 0, 0], totalScore: 0, place: null }
          ],
          tieBreaker: { flagVote: null, rescoreRound: null }
        }
      },
      tatamis: [
        { id: 1, name: 'Tatami 1', activeBoutId: 'bout_kumite_u12', activeMatchNumber: 1, assignedBoutIds: ['bout_kumite_u12'], status: 'Active', lastUpdated: now },
        { id: 2, name: 'Tatami 2', activeBoutId: 'bout_kumite_u14', activeMatchNumber: 1, assignedBoutIds: ['bout_kumite_u14'], status: 'Active', lastUpdated: now },
        { id: 3, name: 'Tatami 3', activeBoutId: 'bout_kata_open', activeMatchNumber: 1, assignedBoutIds: ['bout_kata_open'], status: 'Active', lastUpdated: now },
        { id: 4, name: 'Tatami 4', activeBoutId: null, activeMatchNumber: null, assignedBoutIds: [], status: 'Empty', lastUpdated: now },
        { id: 5, name: 'Tatami 5', activeBoutId: null, activeMatchNumber: null, assignedBoutIds: [], status: 'Empty', lastUpdated: now },
        { id: 6, name: 'Tatami 6', activeBoutId: null, activeMatchNumber: null, assignedBoutIds: [], status: 'Empty', lastUpdated: now },
        { id: 7, name: 'Tatami 7', activeBoutId: null, activeMatchNumber: null, assignedBoutIds: [], status: 'Empty', lastUpdated: now },
        { id: 8, name: 'Tatami 8', activeBoutId: null, activeMatchNumber: null, assignedBoutIds: [], status: 'Empty', lastUpdated: now }
      ],
      lastUpdated: now
    };

    await postState(tournamentState);
    await sleep(200);

    assert(displayClient.messages.length >= 1, 'Display Screen received Organizer initial broadcast');
    assert(tatami1Client.messages.length >= 1, 'Tatami 1 received assigned bout notification');
    assert(tatami2Client.messages.length >= 1, 'Tatami 2 received assigned bout notification');

    // TEST 4: Simultaneous Concurrent Actions from 3 Different Tatami Rings
    console.log('\n5️⃣  Simulating 3 Operators Submitting Live Actions at the Exact Same Millisecond...');
    
    // Action A (Tatami 1): Blue (AAO: Rohan Sharma) WINS Match 1 with 4-1 score
    const t1Time = Date.now() + 100;
    const t1Payload = JSON.parse(JSON.stringify(tournamentState));
    const bracket1 = t1Payload.brackets['bout_kumite_u12'];
    bracket1.matches[0].status = 'Completed';
    // Test the Blue / AAO winner progression logic!
    const isAaoWinner = true; // Blue won!
    bracket1.matches[0].winner = isAaoWinner ? bracket1.matches[0].aao : bracket1.matches[0].aka;
    bracket1.matches[0].loser = isAaoWinner ? bracket1.matches[0].aka : bracket1.matches[0].aao;
    bracket1.matches[0].score = { aaoPoints: 4, akaPoints: 1, winReason: 'Time Up - Aao Wins' };
    bracket1.lastUpdated = t1Time;
    t1Payload.bouts[0].status = 'Completed';
    t1Payload.bouts[0].lastUpdated = t1Time;
    t1Payload.tatamis[0].lastUpdated = t1Time;

    // Action B (Tatami 2): Red (AKA: Karan Mehta) WINS Match 1 with 8-0 Senshu
    const t2Time = Date.now() + 150;
    const t2Payload = JSON.parse(JSON.stringify(tournamentState));
    const bracket2 = t2Payload.brackets['bout_kumite_u14'];
    bracket2.matches[0].status = 'Completed';
    bracket2.matches[0].winner = bracket2.matches[0].aka;
    bracket2.matches[0].loser = bracket2.matches[0].aao;
    bracket2.matches[0].score = { aaoPoints: 0, akaPoints: 8, winReason: 'Victory by 8-Pt Lead' };
    bracket2.lastUpdated = t2Time;
    t2Payload.bouts[1].status = 'Completed';
    t2Payload.bouts[1].lastUpdated = t2Time;
    t2Payload.tatamis[1].lastUpdated = t2Time;

    // Action C (Tatami 3): Kata Ring Operator enters scores for Competitor 1
    const t3Time = Date.now() + 200;
    const t3Payload = JSON.parse(JSON.stringify(tournamentState));
    const bracket3 = t3Payload.brackets['bout_kata_open'];
    bracket3.competitors[0].scores = [8.2, 8.4, 8.5, 8.3, 8.6];
    bracket3.competitors[0].totalScore = 42.0;
    bracket3.competitors[0].place = 1;
    bracket3.lastUpdated = t3Time;
    t3Payload.tatamis[2].lastUpdated = t3Time;

    // Execute all 3 network posts concurrently
    const [resT1, resT2, resT3] = await Promise.all([
      postState(t1Payload),
      postState(t2Payload),
      postState(t3Payload)
    ]);

    assert(resT1.success && resT2.success && resT3.success, 'All 3 concurrent ring updates accepted by server');
    await sleep(400);

    // TEST 5: Verify Conflict-Free Server Merge
    console.log('\n6️⃣  Verifying Server RAM Cache & Conflict-Free Merging...');
    const mergedState = await getState();
    
    // Check Tatami 1 Kumite (Blue / AAO won)
    const m1 = mergedState.brackets['bout_kumite_u12'].matches[0];
    assert(m1.status === 'Completed', 'Tatami 1 Match marked Completed');
    assert(m1.winner.name === 'Rohan Sharma', 'Tatami 1 AAO/Blue winner correctly recorded (Rohan Sharma)');
    assert(m1.loser.name === 'Aditya Patil', 'Tatami 1 loser correctly recorded (Aditya Patil)');

    // Check Tatami 2 Kumite (Red / AKA won)
    const m2 = mergedState.brackets['bout_kumite_u14'].matches[0];
    assert(m2.status === 'Completed', 'Tatami 2 Match marked Completed');
    assert(m2.winner.name === 'Karan Mehta', 'Tatami 2 AKA/Red winner correctly recorded (Karan Mehta)');

    // Check Tatami 3 Kata (Competitor scored)
    const comp1 = mergedState.brackets['bout_kata_open'].competitors[0];
    assert(comp1.totalScore === 42.0, 'Tatami 3 Kata scores preserved (Total 42.00)');
    assert(comp1.scores.length === 5, 'Tatami 3 all 5 referee scores preserved');

    // Check Tatami Rings Active Status - NONE should be cleared!
    assert(mergedState.tatamis[0].status === 'Active', 'Tatami 1 remained Active');
    assert(mergedState.tatamis[1].status === 'Active', 'Tatami 2 remained Active');
    assert(mergedState.tatamis[2].status === 'Active', 'Tatami 3 remained Active');

    // TEST 6: Real-Time Multi-Device WebSocket Broadcasts
    console.log('\n7️⃣  Verifying Real-Time WebSocket Delivery to Spectator & Other Rings...');
    const lastDisplayMsg = displayClient.messages[displayClient.messages.length - 1];
    assert(lastDisplayMsg && lastDisplayMsg.brackets, 'Spectator Display received live WebSocket updates');
    assert(lastDisplayMsg.brackets['bout_kumite_u12'].matches[0].winner.name === 'Rohan Sharma', 'Spectator Display reflects live Kumite winner');
    assert(lastDisplayMsg.brackets['bout_kata_open'].competitors[0].totalScore === 42.0, 'Spectator Display reflects live Kata score');

    // TEST 7: Disk Persistence Verification ('tournament_data.json')
    console.log('\n8️⃣  Testing Disk Persistence (Reading tournament_data.json from file system)...');
    await sleep(400); // Give disk writer 300ms debounce
    const diskRaw = fs.readFileSync(DATA_FILE, 'utf8');
    const diskData = JSON.parse(diskRaw);
    assert(diskData && diskData.bouts && diskData.bouts.length === 3, 'Disk file contains all 3 bouts');
    assert(diskData.brackets['bout_kumite_u12'].matches[0].winner.name === 'Rohan Sharma', 'Disk file persisted Tatami 1 Kumite winner');
    assert(diskData.brackets['bout_kumite_u14'].matches[0].winner.name === 'Karan Mehta', 'Disk file persisted Tatami 2 Kumite winner');
    assert(diskData.brackets['bout_kata_open'].competitors[0].totalScore === 42.0, 'Disk file persisted Tatami 3 Kata score');

    // TEST 8: Full Server Restart & Cold-State Recovery
    console.log('\n9️⃣  Testing Cold-Start Server Recovery (Stopping & restarting server)...');
    stopServer();
    await sleep(600);
    await startServer();
    await sleep(400);

    const coldState = await getState();
    assert(coldState.bouts.length === 3, 'Server reboot restored all 3 bouts from disk');
    assert(coldState.brackets['bout_kumite_u12'].matches[0].winner.name === 'Rohan Sharma', 'Server reboot recovered Match 1 result');
    assert(coldState.brackets['bout_kata_open'].competitors[0].totalScore === 42.0, 'Server reboot recovered Kata scores');

    // TEST 9: Global Database Reset Verification
    console.log('\n🔟 Testing Global Database Reset (/api/reset)...');
    const resetRes = await fetch(`${SERVER_URL}/api/reset`, { method: 'POST' });
    const resetData = await resetRes.json();
    assert(resetData.success, 'Reset API returned success');
    await sleep(200);

    const emptyState = await getState();
    assert(emptyState === null || (emptyState.bouts && emptyState.bouts.length === 0), 'Server RAM cache cleared to empty state');

    // Re-seed clean blank state
    const cleanInitState = {
      tournamentInfo: {
        title: 'SHOTOKAN KARATE CHAMPIONSHIP',
        date: new Date().toISOString().split('T')[0],
        referees: ['Ref 1', 'Ref 2', 'Ref 3', 'Ref 4', 'Ref 5']
      },
      participants: [],
      bouts: [],
      brackets: {},
      tatamis: Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        name: `Tatami ${i + 1}`,
        activeBoutId: null,
        activeMatchNumber: null,
        assignedBoutIds: [],
        status: 'Empty',
        lastUpdated: 0
      })),
      currentUser: null,
      lastUpdated: 0
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(cleanInitState, null, 2), 'utf8');

    // Final Summary
    console.log('\n======================================================');
    console.log(`🏁 TEST SUITE COMPLETED: ${passedTests} / ${totalTests} TESTS PASSED!`);
    console.log('======================================================\n');

    organizerClient.ws.close();
    tatami1Client.ws.close();
    tatami2Client.ws.close();
    tatami3Client.ws.close();
    displayClient.ws.close();
    stopServer();

    process.exit(passedTests === totalTests ? 0 : 1);
  } catch(err) {
    console.error('Test suite failed with unexpected error:', err);
    stopServer();
    process.exit(1);
  }
}

run();
