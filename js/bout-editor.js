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

      // Check if it's a BYE match ready to advance
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
            <!-- R1 (Matches 1..4) -->
            <div class="round-column d-flex flex-column gap-3">
              <h6 class="text-center text-secondary mb-1">Round 1</h6>
              ${renderMatchCard(m[0])}
              ${renderMatchCard(m[1])}
              ${renderMatchCard(m[2])}
              ${renderMatchCard(m[3])}
            </div>

            <!-- Quarter Finals (Matches 9, 10) -->
            <div class="round-column d-flex flex-column gap-5 justify-content-around">
              <h6 class="text-center text-secondary mb-1">Quarter Final</h6>
              ${renderMatchCard(m[8])}
              ${renderMatchCard(m[9])}
            </div>

            <!-- Left Semi-Final (Match 13) -->
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
            <!-- R1 (Matches 5..8) -->
            <div class="round-column d-flex flex-column gap-3">
              <h6 class="text-center text-secondary mb-1">Round 1</h6>
              ${renderMatchCard(m[4])}
              ${renderMatchCard(m[5])}
              ${renderMatchCard(m[6])}
              ${renderMatchCard(m[7])}
            </div>

            <!-- Quarter Finals (Matches 11, 12) -->
            <div class="round-column d-flex flex-column gap-5 justify-content-around">
              <h6 class="text-center text-secondary mb-1">Quarter Final</h6>
              ${renderMatchCard(m[10])}
              ${renderMatchCard(m[11])}
            </div>

            <!-- Right Semi-Final (Match 14) -->
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
    
    // Also re-render Tatami ring container if active
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  }
};

window.BoutEditor = BoutEditor;
