/**
 * Main Application Orchestrator for Shotokan Karate Championship System
 */

document.addEventListener('DOMContentLoaded', () => {
  AuthService.init();
  SyncService.init();

  const loginModalEl = document.getElementById('loginModal');
  const loginModal = new bootstrap.Modal(loginModalEl);

  if (!AuthService.isLoggedIn()) {
    loginModal.show();
  } else {
    applyUserPermissions();
  }

  // Bind Login Form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUserSelect').value;
      const password = document.getElementById('loginPassword').value;

      const res = AuthService.login(username, password);
      if (res.success) {
        document.getElementById('loginError').style.display = 'none';
        loginModal.hide();
        applyUserPermissions();
        SyncService.loadFromAivenDB();
      } else {
        const errEl = document.getElementById('loginError');
        errEl.innerText = res.message;
        errEl.style.display = 'block';
      }
    });
  }

  // Bind Navbar Navigation Tabs
  const tabOrganizer = document.getElementById('tabOrganizer');
  const tabTatami = document.getElementById('tabTatami');
  const tabBoutSheets = document.getElementById('tabBoutSheets');

  if (tabOrganizer) {
    tabOrganizer.addEventListener('click', (e) => {
      e.preventDefault();
      if (AuthService.currentUser && AuthService.currentUser.role === 'organizer') {
        switchTab('organizer');
      }
    });
  }

  if (tabTatami) {
    tabTatami.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('tatami');
    });
  }

  if (tabBoutSheets) {
    tabBoutSheets.addEventListener('click', (e) => {
      e.preventDefault();
      if (AuthService.currentUser && AuthService.currentUser.role === 'organizer') {
        switchTab('boutsheets');
      }
    });
  }

  // Bind Excel Upload Input
  const excelFileInput = document.getElementById('excelFileInput');
  if (excelFileInput) {
    excelFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        document.getElementById('importStatus').innerText = 'Reading Excel file...';
        const participants = await ExcelImporter.parseExcelFile(file);
        
        document.getElementById('importStatus').innerText = `Parsed ${participants.length} participants. Generating bout sheets...`;
        
        const eventMode = document.getElementById('eventModeSelect') ? document.getElementById('eventModeSelect').value : 'both';
        const bouts = ExcelImporter.generateBoutGroups(participants, eventMode);
        const brackets = {};
        
        bouts.forEach(b => {
          brackets[b.id] = BracketEngine.createBracket(b);
        });

        SyncService.setBoutsAndBrackets(bouts, brackets);
        
        document.getElementById('importStatus').innerText = `✅ Successfully created ${bouts.length} Bout Sheets! Ready to assign and view.`;
        renderBoutList('boutSheetsListContainer');
        TatamiManager.renderOrganizerDashboard('tatamiDashboardContainer');

      } catch (err) {
        console.error('Error importing Excel:', err);
        const statusEl = document.getElementById('importStatus');
        if (statusEl) {
          statusEl.className = 'fw-bold text-danger';
          statusEl.innerText = 'Failed to import Excel file: ' + (err.message || 'Check column format.');
        }
      }
    });
  }

  // Export Results Button
  const btnExport = document.getElementById('btnExportResults');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      ExportEngine.exportTournamentResults();
    });
  }

  // Initial & Live State Change Subscription
  SyncService.subscribe((state) => {
    const user = AuthService.currentUser;
    if (user) {
      if (user.role === 'organizer') {
        renderBoutList('boutSheetsListContainer');
        TatamiManager.renderOrganizerDashboard('tatamiDashboardContainer');
        const boutEditorView = document.getElementById('boutEditorView');
        if (BoutEditor.activeBoutId && boutEditorView && boutEditorView.style.display !== 'none') {
          BoutEditor.renderBoutSheet(BoutEditor.activeBoutId, 'activeBoutDiagramContainer');
        }
      } else if (user.role === 'tatami') {
        TatamiManager.renderOperatorView(user.tatamiId, 'tatamiOperatorContainer');
      }
    }
  });
});

function applyUserPermissions() {
  const user = AuthService.currentUser;
  if (!user) return;

  document.getElementById('userBadge').innerText = `👤 ${user.name}`;

  if (user.role === 'organizer') {
    document.querySelectorAll('.nav-organizer-only').forEach(el => el.style.display = '');
    switchTab('organizer');
  } else if (user.role === 'tatami') {
    document.querySelectorAll('.nav-organizer-only').forEach(el => el.style.display = 'none');
    switchTab('tatami');
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.view-pane').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));

  const user = AuthService.currentUser;

  if (tabName === 'organizer' && user && user.role === 'organizer') {
    document.getElementById('organizerView').style.display = 'block';
    document.getElementById('tabOrganizer').classList.add('active');
    TatamiManager.renderOrganizerDashboard('tatamiDashboardContainer');
  } else if (tabName === 'tatami') {
    document.getElementById('tatamiView').style.display = 'block';
    document.getElementById('tabTatami').classList.add('active');
    renderTatamiSelector();
  } else if (tabName === 'boutsheets' && user && user.role === 'organizer') {
    document.getElementById('boutEditorView').style.display = 'block';
    document.getElementById('tabBoutSheets').classList.add('active');
    renderBoutList('boutSheetsListContainer');
  }
}

function renderBoutList(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const bouts = SyncService.state.bouts;
  const isOrganizer = AuthService.currentUser && AuthService.currentUser.role === 'organizer';

  if (!bouts || bouts.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info text-center py-4">
        <p class="mb-2">No bout sheets created yet.</p>
        ${isOrganizer ? `
          <button class="btn btn-primary btn-sm fw-bold shadow-sm" onclick="BoutEditor.openCreateBoutModal()">
            ➕ Add New Bout (Kata / Kumite)
          </button>
        ` : ''}
      </div>
    `;
    return;
  }

  let html = `<div class="list-group">`;

  bouts.forEach(b => {
    const competitorCount = b.participants ? b.participants.length : (b.eventType === 'Kata' ? (SyncService.state.brackets[b.id]?.competitors?.length || 0) : 0);
    const eventLabel = b.eventType || 'Kumite';
    const badgeBg = eventLabel === 'Kata' ? 'bg-info text-dark' : 'bg-danger text-white';

    html += `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div style="cursor: pointer; flex: 1;" onclick="loadBoutIntoEditor('${b.id}')">
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge ${badgeBg} fs-7">${eventLabel}</span>
            <h6 class="mb-0 fw-bold text-primary">${b.boutName}</h6>
          </div>
          <small class="text-muted">Code: ${b.boutCode} | ${competitorCount} Competitors</small>
        </div>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm fw-bold border-primary" style="width: 140px;" onchange="handleQuickTatamiAssign('${b.id}', this.value)">
            <option value="" ${!b.tatamiId ? 'selected' : ''}>Unassigned</option>
            ${Array.from({length: 8}, (_, i) => `<option value="${i+1}" ${b.tatamiId === (i+1) ? 'selected' : ''}>Tatami ${i+1}</option>`).join('')}
          </select>
          <span class="badge ${b.status === 'Completed' ? 'bg-success' : 'bg-warning text-dark'}">${b.status}</span>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

function handleQuickTatamiAssign(boutId, tatamiIdVal) {
  if (!tatamiIdVal) {
    SyncService.unassignBoutFromTatami(boutId);
  } else {
    const numericTatamiId = parseInt(tatamiIdVal, 10);
    SyncService.assignBoutToTatami(numericTatamiId, boutId);
  }
}

function loadBoutIntoEditor(boutId) {
  switchTab('boutsheets');
  BoutEditor.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
}

function renderTatamiSelector() {
  const user = AuthService.currentUser;
  const select = document.getElementById('tatamiRingSelect');
  if (!select) return;

  if (user && user.role === 'tatami') {
    const tatamiId = user.tatamiId;
    select.innerHTML = `<option value="${tatamiId}">Tatami ${tatamiId} Ring</option>`;
    select.disabled = true;
    TatamiManager.renderOperatorView(tatamiId, 'tatamiOperatorContainer');
  } else {
    const tatamis = SyncService.state.tatamis;
    select.disabled = false;
    select.innerHTML = tatamis.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    select.onchange = (e) => {
      const tId = parseInt(e.target.value, 10);
      TatamiManager.renderOperatorView(tId, 'tatamiOperatorContainer');
    };
    TatamiManager.renderOperatorView(parseInt(select.value, 10) || 1, 'tatamiOperatorContainer');
  }
}
