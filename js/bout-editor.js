/**
 * 16-Slot Interactive Bout Sheet Editor & Official Diagram Renderer
 * Matches Shotokan Karate Championship physical bracket sheet layout
 */

const BoutEditor = {
  activeBoutId: null,

  renderBoutSheet(boutId, containerId) {
    this.activeBoutId = boutId;
    const bracket = SyncService.state.brackets[boutId];
    const container = document.getElementById(containerId);

    if (!bracket || !container) return;

    const m = bracket.matches;
    const isOrganizer = AuthService.currentUser && AuthService.currentUser.role === 'organizer';

    // Helper for rendering a fighter box
    const renderFighterBox = (slotParticipant, label, isWinner) => {
      if (!slotParticipant) return `<div class="fighter-box bye"><span>${label}: BYE</span></div>`;
      const winnerClass = isWinner ? 'winner-highlight' : '';
      return `
        <div class="fighter-box ${label.toLowerCase()} ${winnerClass}">
          <span class="badge bg-secondary me-1">${label}</span>
          <span class="fw-bold">${slotParticipant.name}</span>
          <small class="text-muted ms-1">(${slotParticipant.branch || 'Dojo'})</small>
        </div>
      `;
    };

    const renderMatchCard = (match) => {
      const isCompleted = match.status === 'Completed';
      const aaoWon = isCompleted && match.winner && match.aao && match.winner.id === match.aao.id;
      const akaWon = isCompleted && match.winner && match.aka && match.winner.id === match.aka.id;

      const isByeMatch = !isCompleted && ((match.aao && !match.aka) || (!match.aao && match.aka) || (!match.aao && !match.aka));

      return `
        <div class="match-card ${isCompleted ? 'completed' : ''}">
          <div class="match-header d-flex justify-content-between align-items-center">
            <small class="fw-bold">Match #${match.matchNumber}</small>
            <span class="badge ${isCompleted ? 'bg-success' : (match.status === 'Scheduled' ? 'bg-warning text-dark' : 'bg-secondary')}">${match.status}</span>
          </div>
          <div class="match-body my-1" onclick="BoutEditor.onMatchClick('${boutId}', ${match.matchNumber})">
            ${renderFighterBox(match.aao, 'AAO', aaoWon)}
            ${renderFighterBox(match.aka, 'AKA', akaWon)}
          </div>
          ${isByeMatch ? `
            <button class="btn btn-xs btn-outline-success w-100 py-0 text-nowrap mt-1 fs-7" onclick="event.stopPropagation(); BoutEditor.advanceBye('${boutId}', ${match.matchNumber})">
              ⚡ Advance BYE
            </button>
          ` : ''}
        </div>
      `;
    };

    const html = `
      <div class="d-flex justify-content-between align-items-center mb-3 no-print">
        <h4 class="m-0 fw-bold text-dark">Bout Sheet: ${bracket.boutName}</h4>
        <div class="d-flex gap-2">
          ${isOrganizer ? `
            <button class="btn btn-warning fw-bold shadow-sm" onclick="BoutEditor.openEditModal('${boutId}')">
              ✏️ Edit Bout Sheet & Seedings
            </button>
          ` : ''}
          <button class="btn btn-secondary fw-bold shadow-sm" onclick="window.print()">
            🖨️ Print / Save PDF
          </button>
        </div>
      </div>

      <div class="bout-sheet-printable shadow-lg p-4 bg-white text-dark rounded">
        <!-- Sheet Header -->
        <div class="text-center border-bottom pb-2 mb-3">
          <h2 class="fw-bold tracking-wide">SHOTOKAN KARATE CHAMPIONSHIP</h2>
          <div class="row g-2 text-start fw-bold mt-2" style="font-size: 0.95rem;">
            <div class="col-md-3">Age/Category: <span class="text-primary">${bracket.boutName}</span></div>
            <div class="col-md-3">Arena No: <span class="text-primary">Tatami ${bracket.tatamiId || 'Unassigned'}</span></div>
            <div class="col-md-3">Belt Category: <span class="text-primary">${bracket.beltTier}</span></div>
            <div class="col-md-3">Gender: <span class="text-primary">${bracket.gender}</span></div>
          </div>
        </div>

        <!-- 16-Slot Double Pool Bracket Diagram -->
        <div class="bracket-diagram-container d-flex justify-content-between align-items-center">
          <!-- LEFT POOL (Pool A) -->
          <div class="bracket-pool left-pool d-flex flex-row align-items-center gap-3" style="flex: 1;">
            <div class="round-column d-flex flex-column gap-3">
              <h6 class="text-center text-secondary mb-1">Round 1</h6>
              ${renderMatchCard(m[0])}
              ${renderMatchCard(m[1])}
              ${renderMatchCard(m[2])}
              ${renderMatchCard(m[3])}
            </div>

            <div class="round-column d-flex flex-column gap-5 justify-content-around">
              <h6 class="text-center text-secondary mb-1">Quarter Final</h6>
              ${renderMatchCard(m[8])}
              ${renderMatchCard(m[9])}
            </div>

            <div class="round-column d-flex flex-column justify-content-center">
              <h6 class="text-center text-secondary mb-1">Semi-Final</h6>
              ${renderMatchCard(m[12])}
            </div>
          </div>

          <!-- CENTER CIRCLE (FINAL MATCH 15) -->
          <div class="bracket-center-circle text-center mx-3 my-auto p-4 rounded-circle border border-3 border-danger shadow" style="width: 230px; height: 230px; display: flex; flex-direction: column; justify-content: center; background: #fff8f8;">
            <h5 class="fw-bold text-danger mb-1">FINAL</h5>
            <small class="text-muted">Center Ring</small>
            <div class="mt-2">
              ${renderMatchCard(m[14])}
            </div>
          </div>

          <!-- RIGHT POOL (Pool B) -->
          <div class="bracket-pool right-pool d-flex flex-row-reverse align-items-center gap-3" style="flex: 1;">
            <div class="round-column d-flex flex-column gap-3">
              <h6 class="text-center text-secondary mb-1">Round 1</h6>
              ${renderMatchCard(m[4])}
              ${renderMatchCard(m[5])}
              ${renderMatchCard(m[6])}
              ${renderMatchCard(m[7])}
            </div>

            <div class="round-column d-flex flex-column gap-5 justify-content-around">
              <h6 class="text-center text-secondary mb-1">Quarter Final</h6>
              ${renderMatchCard(m[10])}
              ${renderMatchCard(m[11])}
            </div>

            <div class="round-column d-flex flex-column justify-content-center">
              <h6 class="text-center text-secondary mb-1">Semi-Final</h6>
              ${renderMatchCard(m[13])}
            </div>
          </div>
        </div>

        <!-- MEDALS & REFEREES FOOTER -->
        <div class="border-top mt-4 pt-3">
          <div class="row text-center fw-bold fs-5 mb-3">
            <div class="col-3 text-warning">🥇 GOLD: <span class="text-dark">${bracket.medals.gold ? bracket.medals.gold.name : '_______'}</span></div>
            <div class="col-3 text-secondary">🥈 SILVER: <span class="text-dark">${bracket.medals.silver ? bracket.medals.silver.name : '_______'}</span></div>
            <div class="col-3 text-danger">🥉 BRONZE 1: <span class="text-dark">${bracket.medals.bronze1 ? bracket.medals.bronze1.name : '_______'}</span></div>
            <div class="col-3 text-danger">🥉 BRONZE 2: <span class="text-dark">${bracket.medals.bronze2 ? bracket.medals.bronze2.name : '_______'}</span></div>
          </div>
          <div class="d-flex justify-content-between text-muted fs-6 border-top pt-2">
            <span>Referee 1: ____________</span>
            <span>Referee 2: ____________</span>
            <span>Referee 3: ____________</span>
            <span>Referee 4: ____________</span>
            <span>Referee 5: ____________</span>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  },

  onMatchClick(boutId, matchNumber) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;
    const match = bracket.matches[matchNumber - 1];

    if (!match) return;

    if (match.aao && match.aka) {
      ScoreboardController.loadMatch(boutId, matchNumber);
    } else if (match.aao || match.aka) {
      this.advanceBye(boutId, matchNumber);
    }
  },

  advanceBye(boutId, matchNumber) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    BracketEngine.advanceByeMatch(bracket, matchNumber);
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
    
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  },

  // Open Interactive Edit Modal for Organizer
  openEditModal(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    const slots = bracket.slots;
    const slotOptions = slots.map((s, idx) => {
      const label = s ? `Slot ${idx + 1}: ${s.name} (${s.branch || 'Dojo'})` : `Slot ${idx + 1}: [EMPTY / BYE]`;
      return `<option value="${idx}">${label}</option>`;
    }).join('');

    const modalHtml = `
      <div class="modal fade" id="editBoutModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title fw-bold">✏️ Edit Bout Sheet: ${bracket.boutName}</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <ul class="nav nav-tabs mb-3" id="editModalTabs">
                <li class="nav-item">
                  <button class="nav-link active fw-bold" id="tabSwap" onclick="BoutEditor.switchModalSubTab('swap')">🔄 Swap Positions</button>
                </li>
                <li class="nav-item">
                  <button class="nav-link fw-bold" id="tabEditFighter" onclick="BoutEditor.switchModalSubTab('editFighter')">👤 Edit Fighter / Late Entry</button>
                </li>
              </ul>

              <!-- SUBTAB 1: SWAP POSITIONS -->
              <div id="subTabSwap" class="subtab-pane">
                <p class="text-muted small">Select two slots to swap their positions in the Round 1 bracket:</p>
                <div class="row g-3 mb-3">
                  <div class="col-md-6">
                    <label class="form-label fw-bold">First Participant / Slot:</label>
                    <select id="swapSlotA" class="form-select">${slotOptions}</select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-bold">Second Participant / Slot:</label>
                    <select id="swapSlotB" class="form-select">${slotOptions}</select>
                  </div>
                </div>
                <button type="button" class="btn btn-warning w-100 fw-bold" onclick="BoutEditor.confirmSwap('${boutId}')">🔄 Swap Positions</button>
              </div>

              <!-- SUBTAB 2: EDIT FIGHTER / LATE ENTRY -->
              <div id="subTabEditFighter" class="subtab-pane" style="display: none;">
                <div class="mb-3">
                  <label class="form-label fw-bold">Select Target Slot:</label>
                  <select id="editSlotSelect" class="form-select" onchange="BoutEditor.loadSlotDataIntoForm('${boutId}', this.value)">
                    ${slotOptions}
                  </select>
                </div>
                <div class="row g-2">
                  <div class="col-md-6">
                    <label class="form-label fw-bold">Participant Name:</label>
                    <input type="text" id="editFighterName" class="form-control" placeholder="Enter Name">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label fw-bold">Branch / Dojo:</label>
                    <input type="text" id="editFighterBranch" class="form-control" placeholder="Enter Branch/Dojo">
                  </div>
                </div>
                <button type="button" class="btn btn-success w-100 fw-bold mt-3" onclick="BoutEditor.saveFighterDetails('${boutId}')">💾 Save Participant Details</button>
              </div>

            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    const modal = new bootstrap.Modal(document.getElementById('editBoutModal'));
    modal.show();

    this.loadSlotDataIntoForm(boutId, 0);
  },

  switchModalSubTab(tabName) {
    document.querySelectorAll('.subtab-pane').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#editModalTabs .nav-link').forEach(el => el.classList.remove('active'));

    if (tabName === 'swap') {
      document.getElementById('subTabSwap').style.display = 'block';
      document.getElementById('tabSwap').classList.add('active');
    } else {
      document.getElementById('subTabEditFighter').style.display = 'block';
      document.getElementById('tabEditFighter').classList.add('active');
    }
  },

  loadSlotDataIntoForm(boutId, slotIndex) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;
    const slot = bracket.slots[slotIndex];

    document.getElementById('editFighterName').value = slot ? slot.name : '';
    document.getElementById('editFighterBranch').value = slot ? slot.branch : '';
  },

  confirmSwap(boutId) {
    const slotA = parseInt(document.getElementById('swapSlotA').value, 10);
    const slotB = parseInt(document.getElementById('swapSlotB').value, 10);

    if (slotA === slotB) return alert('Select two different slots to swap!');

    SyncService.swapBracketSlots(boutId, slotA, slotB);

    const modalEl = document.getElementById('editBoutModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  saveFighterDetails(boutId) {
    const slotIndex = parseInt(document.getElementById('editSlotSelect').value, 10);
    const name = document.getElementById('editFighterName').value.trim();
    const branch = document.getElementById('editFighterBranch').value.trim();

    if (!name) return alert('Please enter a participant name!');

    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    if (!bracket.slots[slotIndex]) {
      // Insert new late entry participant
      bracket.slots[slotIndex] = {
        id: 'p_' + Math.random().toString(36).substr(2, 9),
        name,
        branch,
        gender: bracket.gender,
        age: 10,
        belt: 9,
        beltLabel: 'Kyu 9 (White)',
        beltTier: bracket.beltTier,
        schoolHours: false
      };
    } else {
      bracket.slots[slotIndex].name = name;
      bracket.slots[slotIndex].branch = branch;
    }

    // Rebuild Round 1 matches
    for (let i = 0; i < 8; i++) {
      const aao = bracket.slots[i * 2];
      const aka = bracket.slots[i * 2 + 1];
      const match = bracket.matches[i];
      if (match.status !== 'Completed') {
        match.aao = aao;
        match.aka = aka;
        match.status = (aao || aka) ? 'Scheduled' : 'Empty';
      }
    }

    SyncService.saveToLocal();

    const modalEl = document.getElementById('editBoutModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  }
};

window.BoutEditor = BoutEditor;
