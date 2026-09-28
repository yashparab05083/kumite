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

      const statusEl = document.getElementById('importStatus');

      try {
        if (statusEl) {
          statusEl.className = 'fw-bold text-primary mb-3';
          statusEl.innerText = '⏳ Reading Excel file...';
        }

        const participants = await ExcelImporter.parseExcelFile(file);
        
        if (!participants || participants.length === 0) {
          if (statusEl) {
            statusEl.className = 'fw-bold text-danger mb-3';
            statusEl.innerText = '❌ No valid participants found in Excel file! Ensure column headers match Name, Gender, Age, Belt, Branch.';
          }
          return;
        }

        if (statusEl) {
          statusEl.innerText = `⏳ Parsed ${participants.length} participants. Generating bout sheets...`;
        }
        
        const bouts = ExcelImporter.generateBoutGroups(participants);
        const brackets = {};
        
        bouts.forEach(b => {
          brackets[b.id] = BracketEngine.createBracket(b);
        });

        SyncService.setBoutsAndBrackets(bouts, brackets);
        
        if (statusEl) {
          statusEl.className = 'fw-bold text-success mb-3';
          statusEl.innerText = `✅ Successfully created ${bouts.length} Bout Sheets for ${participants.length} participants!`;
        }

        renderBoutList('boutSheetsListContainer');
        TatamiManager.renderOrganizerDashboard('tatamiDashboardContainer');

      } catch (err) {
        console.error('Error importing Excel:', err);
        if (statusEl) {
          statusEl.className = 'fw-bold text-danger mb-3';
          statusEl.innerText = '❌ Error importing Excel file: ' + (err.message || err);
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

  // Initial Render Subscription
  SyncService.subscribe((state) => {
    if (AuthService.currentUser && AuthService.currentUser.role === 'organizer') {
      renderBoutList('boutSheetsListContainer');
      TatamiManager.renderOrganizerDashboard('tatamiDashboardContainer');
    }
  });
});

function applyUserPermissions() {
  const user = AuthService.currentUser;
  if (!user) return;

  // Update Badge
  const userBadge = document.getElementById('userBadge');
  if (userBadge) userBadge.innerText = `👤 ${user.name}`;

  if (user.role === 'organizer') {
    document.querySelectorAll('.nav-organizer-only').forEach(el => el.style.display = 'block');
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
  if (!bouts || bouts.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No bout sheets created yet. Upload a participant Excel file above to generate bout sheets.</div>';
    return;
  }

  let html = `<div class="list-group">`;

  bouts.forEach(b => {
    html += `
      <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" onclick="loadBoutIntoEditor('${b.id}')">
        <div>
          <h6 class="mb-0 fw-bold">${b.boutName}</h6>
          <small class="text-muted">Code: ${b.boutCode} | ${b.participants.length} Participants</small>
        </div>
        <div>
          <span class="badge ${b.tatamiId ? 'bg-primary' : 'bg-secondary'} me-2">${b.tatamiId ? 'Tatami ' + b.tatamiId : 'Unassigned'}</span>
          <span class="badge ${b.status === 'Completed' ? 'bg-success' : 'bg-warning text-dark'}">${b.status}</span>
        </div>
      </button>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
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
