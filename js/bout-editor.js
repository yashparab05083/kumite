/**
 * 16-Slot Interactive Bout Sheet Editor & Official Diagram Renderer
 * Supports Drag/Drop, Slot Swapping, Participant Re-assignment, Late Entry Editing, Undo Match, and 1-Page Landscape PDF Export
 */

const BoutEditor = {
  activeBoutId: null,
  isEditMode: false,

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (this.activeBoutId) {
      this.renderBoutSheet(this.activeBoutId, 'activeBoutDiagramContainer');
    }
  },

  generateBoutSheetHTML(bracket, isOrganizer) {
    const m = bracket.matches;

    const renderFighterBox = (slotParticipant, label, isWinner, slotIndex) => {
      if (!slotParticipant) {
        return `
          <div class="fighter-box bye d-flex justify-content-between align-items-center">
            <span>${label}: BYE</span>
            ${(isOrganizer && this.isEditMode && slotIndex !== undefined) ? `
              <button class="btn btn-xs btn-outline-primary py-0 px-1 ms-1 fs-7 print-hide" onclick="event.stopPropagation(); BoutEditor.openSlotModal('${bracket.boutId}', ${slotIndex})">✏️ Edit</button>
            ` : ''}
          </div>
        `;
      }

      const winnerClass = isWinner ? 'winner-highlight' : '';
      return `
        <div class="fighter-box ${label.toLowerCase()} ${winnerClass} d-flex justify-content-between align-items-center">
          <div class="text-truncate">
            <span class="badge bg-secondary me-1">${label}</span>
            <span class="fw-bold">${slotParticipant.name}</span>
          </div>
          ${(isOrganizer && this.isEditMode && slotIndex !== undefined) ? `
            <button class="btn btn-xs btn-light py-0 px-1 ms-1 border fs-7 print-hide" onclick="event.stopPropagation(); BoutEditor.openSlotModal('${bracket.boutId}', ${slotIndex})">⚙️</button>
          ` : ''}
        </div>
      `;
    };

    const renderMatchCard = (match, roundIndex) => {
      const isCompleted = match.status === 'Completed';
      const aaoWon = isCompleted && match.winner && match.aao && match.winner.id === match.aao.id;
      const akaWon = isCompleted && match.winner && match.aka && match.winner.id === match.aka.id;

      const canAdvanceBye = !isCompleted && BracketEngine.canAdvanceBye(bracket, match.matchNumber);

      let aaoSlotIdx = undefined;
      let akaSlotIdx = undefined;
      if (roundIndex === 1) {
        aaoSlotIdx = (match.matchNumber - 1) * 2;
        akaSlotIdx = (match.matchNumber - 1) * 2 + 1;
      }

      return `
        <div class="match-card ${isCompleted ? 'completed' : ''}">
          <div class="match-header d-flex justify-content-between align-items-center">
            <small class="fw-bold">Match #${match.matchNumber}</small>
            <span class="badge ${isCompleted ? 'bg-success' : (match.status === 'Scheduled' ? 'bg-warning text-dark' : 'bg-secondary')}">${match.status}</span>
          </div>
          <div class="match-body my-1" onclick="BoutEditor.onMatchClick('${bracket.boutId}', ${match.matchNumber})">
            ${renderFighterBox(match.aao, 'AAO', aaoWon, aaoSlotIdx)}
            ${renderFighterBox(match.aka, 'AKA', akaWon, akaSlotIdx)}
          </div>
          ${canAdvanceBye ? `
            <button class="btn btn-xs btn-outline-success w-100 py-0 text-nowrap mt-1 fs-7 print-hide" onclick="event.stopPropagation(); BoutEditor.advanceBye('${bracket.boutId}', ${match.matchNumber})">
              ⚡ Advance BYE
            </button>
          ` : ''}
          ${isCompleted ? `
            <button class="btn btn-xs btn-outline-danger w-100 py-0 text-nowrap mt-1 fs-7 print-hide" onclick="event.stopPropagation(); BoutEditor.undoMatch('${bracket.boutId}', ${match.matchNumber})">
              ↩️ Undo Match
            </button>
          ` : ''}
        </div>
      `;
    };

    return `
      <div class="bout-sheet-printable shadow-sm p-3 bg-white text-dark rounded">
        <!-- Sheet Header -->
        <div class="text-center border-bottom pb-2 mb-2">
          <h3 class="fw-bold tracking-wide m-0">SHOTOKAN KARATE CHAMPIONSHIP</h3>
          <div class="row g-1 text-start fw-bold mt-1" style="font-size: 0.9rem;">
            <div class="col-md-3">Age/Category: <span class="text-primary">${bracket.boutName}</span></div>
            <div class="col-md-3">Arena No: <span class="text-primary">Tatami ${bracket.tatamiId || 'Unassigned'}</span></div>
            <div class="col-md-3">Belt Category: <span class="text-primary">${bracket.beltTier}</span></div>
            <div class="col-md-3">Gender: <span class="text-primary">${bracket.gender}</span></div>
          </div>
        </div>

        <!-- 16-Slot Double Pool Bracket Diagram -->
        <div class="bracket-diagram-container d-flex justify-content-between align-items-center">
          <!-- LEFT POOL (Pool A) -->
          <div class="bracket-pool left-pool d-flex flex-row align-items-center gap-2" style="flex: 1;">
            <!-- R1 (Matches 1..4) -->
            <div class="round-column d-flex flex-column gap-2">
              <h6 class="text-center text-secondary mb-1 fs-7">Round 1</h6>
              ${renderMatchCard(m[0], 1)}
              ${renderMatchCard(m[1], 1)}
              ${renderMatchCard(m[2], 1)}
              ${renderMatchCard(m[3], 1)}
            </div>

            <!-- Quarter Finals (Matches 9, 10) -->
            <div class="round-column d-flex flex-column gap-4 justify-content-around">
              <h6 class="text-center text-secondary mb-1 fs-7">Quarter Final</h6>
              ${renderMatchCard(m[8], 2)}
              ${renderMatchCard(m[9], 2)}
            </div>

            <!-- Left Semi-Final (Match 13) -->
            <div class="round-column d-flex flex-column justify-content-center">
              <h6 class="text-center text-secondary mb-1 fs-7">Semi-Final</h6>
              ${renderMatchCard(m[12], 3)}
            </div>
          </div>

          <!-- CENTER CIRCLE (FINAL MATCH 15) -->
          <div class="bracket-center-circle text-center mx-1 my-auto p-2 rounded-circle border border-3 border-danger shadow-sm" style="width: 165px; height: 165px; display: flex; flex-direction: column; justify-content: center; background: #fff8f8;">
            <h6 class="fw-bold text-danger mb-0 fs-6">FINAL</h6>
            <small class="text-muted" style="font-size: 0.7rem;">Center Ring</small>
            <div class="mt-1">
              ${renderMatchCard(m[14], 4)}
            </div>
          </div>

          <!-- RIGHT POOL (Pool B) -->
          <div class="bracket-pool right-pool d-flex flex-row-reverse align-items-center gap-2" style="flex: 1;">
            <!-- R1 (Matches 5..8) -->
            <div class="round-column d-flex flex-column gap-2">
              <h6 class="text-center text-secondary mb-1 fs-7">Round 1</h6>
              ${renderMatchCard(m[4], 1)}
              ${renderMatchCard(m[5], 1)}
              ${renderMatchCard(m[6], 1)}
              ${renderMatchCard(m[7], 1)}
            </div>

            <!-- Quarter Finals (Matches 11, 12) -->
            <div class="round-column d-flex flex-column gap-4 justify-content-around">
              <h6 class="text-center text-secondary mb-1 fs-7">Quarter Final</h6>
              ${renderMatchCard(m[10], 2)}
              ${renderMatchCard(m[11], 2)}
            </div>

            <!-- Right Semi-Final (Match 14) -->
            <div class="round-column d-flex flex-column justify-content-center">
              <h6 class="text-center text-secondary mb-1 fs-7">Semi-Final</h6>
              ${renderMatchCard(m[13], 3)}
            </div>
          </div>
        </div>

        <!-- MEDALS & REFEREES FOOTER -->
        <div class="border-top mt-2 pt-2">
          <div class="row text-center fw-bold fs-6 mb-2">
            <div class="col-3 text-warning">🥇 GOLD: <span class="text-dark">${bracket.medals.gold ? bracket.medals.gold.name : '_______'}</span></div>
            <div class="col-3 text-secondary">🥈 SILVER: <span class="text-dark">${bracket.medals.silver ? bracket.medals.silver.name : '_______'}</span></div>
            <div class="col-3 text-danger">🥉 BRONZE 1: <span class="text-dark">${bracket.medals.bronze1 ? bracket.medals.bronze1.name : '_______'}</span></div>
            <div class="col-3 text-danger">🥉 BRONZE 2: <span class="text-dark">${bracket.medals.bronze2 ? bracket.medals.bronze2.name : '_______'}</span></div>
          </div>
          <div class="d-flex justify-content-between text-muted fs-7 border-top pt-1">
            <span>Referee 1: ____________</span>
            <span>Referee 2: ____________</span>
            <span>Referee 3: ____________</span>
            <span>Referee 4: ____________</span>
            <span>Referee 5: ____________</span>
          </div>
        </div>
      </div>
    `;
  },

  renderBoutSheet(boutId, containerId) {
    this.activeBoutId = boutId;
    const bracket = SyncService.state.brackets[boutId];
    const container = document.getElementById(containerId);

    if (!bracket || !container) return;

    const isOrganizer = AuthService.currentUser && AuthService.currentUser.role === 'organizer';

    const html = `
      <!-- Top Action Toolbar (PDF Export & Print) -->
      <div class="d-flex justify-content-between align-items-center mb-3 bg-light p-2 rounded border print-hide">
        <div class="d-flex gap-2">
          <button class="btn btn-danger btn-sm fw-bold" onclick="BoutEditor.downloadBoutPDF('${boutId}')">📄 Download PDF (1 Page)</button>
          <button class="btn btn-warning text-dark btn-sm fw-bold" onclick="BoutEditor.downloadAllBoutsPDF()">📥 Download All Bout Sheets PDF</button>
          <button class="btn btn-secondary btn-sm fw-bold" onclick="BoutEditor.printBoutSheet()">🖨️ Print Sheet</button>
        </div>
        ${isOrganizer ? `
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm ${this.isEditMode ? 'btn-warning text-dark fw-bold' : 'btn-outline-dark'}" onclick="BoutEditor.toggleEditMode()">
              ${this.isEditMode ? '✏️ Exit Edit Mode' : '✏️ Enable Edit & Reassign Mode'}
            </button>
            ${this.isEditMode ? `
              <button class="btn btn-sm btn-success" onclick="BoutEditor.openAddParticipantModal('${boutId}')">➕ Add Late Entry</button>
              <button class="btn btn-sm btn-info text-white" onclick="BoutEditor.openQuickSwapModal('${boutId}')">🔀 Quick Swap Slots</button>
            ` : ''}
          </div>
        ` : ''}
      </div>

      ${this.generateBoutSheetHTML(bracket, isOrganizer)}
    `;

    container.innerHTML = html;
  },

  // Export Single Active Bout Sheet as 1-Page Landscape PDF
  downloadBoutPDF(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return alert('No active bout sheet found!');

    let element = document.querySelector('.bout-sheet-printable');
    if (!element) {
      this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
      element = document.querySelector('.bout-sheet-printable');
    }

    if (!element) return alert('No active bout sheet diagram found to capture!');

    const filename = `${(bracket.boutCode || 'BOUT').toUpperCase()}_${(bracket.boutName || 'Sheet').replace(/[^a-zA-Z0-9]/g, '_')}_Sheet.pdf`;

    const opt = {
      margin:       [0.05, 0.05, 0.05, 0.05],
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak:    { mode: 'avoid-all' }
    };

    html2pdf().set(opt).from(element).save().catch(err => {
      console.error('Single PDF Export Error:', err);
      alert('Failed to export single bout PDF: ' + err.message);
    });
  },

  // Merge ALL Tournament Bout Sheets into 1 PDF (1 Landscape Page per Bout Sheet, Zero Blank Pages)
  async downloadAllBoutsPDF() {
    const bouts = SyncService.state.bouts;
    if (!bouts || bouts.length === 0) return alert('No bout sheets generated yet!');

    const statusEl = document.getElementById('importStatus');
    if (statusEl) statusEl.innerText = 'Preparing PDF export for all bout sheets... Please wait...';

    const previousBoutId = this.activeBoutId;

    const opt = {
      margin:       [0.05, 0.05, 0.05, 0.05],
      filename:     'Shotokan_Championship_All_Bout_Sheets.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape', compress: true }
    };

    try {
      let masterPdf = null;

      for (let i = 0; i < bouts.length; i++) {
        const b = bouts[i];
        const bracket = SyncService.state.brackets[b.id];
        if (!bracket) continue;

        if (statusEl) {
          statusEl.innerText = `Generating PDF: Bout Sheet ${i + 1} of ${bouts.length} (${b.boutName})...`;
        }

        // Render bout sheet in active container exactly as seen on screen
        this.renderBoutSheet(b.id, 'activeBoutDiagramContainer');
        const element = document.querySelector('.bout-sheet-printable');
        if (!element) continue;

        // Small delay for DOM layout render
        await new Promise(resolve => setTimeout(resolve, 100));

        const worker = html2pdf().set(opt).from(element);

        if (i === 0) {
          // Page 1: Create initial PDF instance using html2pdf's native worker
          const pdfWorker = worker.toPdf();
          masterPdf = await pdfWorker.get('pdf');
        } else {
          // Pages 2..N: Capture canvas with exact html2canvas opt and draw image
          const canvas = await worker.toCanvas().get('canvas');
          if (canvas && masterPdf) {
            const imgData = canvas.toDataURL('image/jpeg', 0.98);
            masterPdf.addPage('a4', 'landscape');
            // A4 landscape in inches = 11.69 x 8.27. With 0.05 margin: printable width = 11.59, height = 8.17
            masterPdf.addImage(imgData, 'JPEG', 0.05, 0.05, 11.59, 8.17);
          }
        }
      }

      // Restore active bout view
      if (previousBoutId) {
        this.renderBoutSheet(previousBoutId, 'activeBoutDiagramContainer');
      }

      if (masterPdf) {
        masterPdf.save('Shotokan_Championship_All_Bout_Sheets.pdf');
        if (statusEl) statusEl.innerText = 'All Bout Sheets downloaded successfully in PDF!';
      } else {
        if (statusEl) statusEl.innerText = 'No bout sheets to export.';
      }
    } catch (err) {
      console.error('All Bouts PDF Export Error:', err);
      if (previousBoutId) {
        this.renderBoutSheet(previousBoutId, 'activeBoutDiagramContainer');
      }
      if (statusEl) statusEl.innerText = 'PDF Export failed: ' + err.message;
      alert('Failed to export all bouts PDF: ' + err.message);
    }
  },

  printBoutSheet() {
    window.print();
  },

  onMatchClick(boutId, matchNumber) {
    if (this.isEditMode) return;

    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;
    const match = bracket.matches[matchNumber - 1];

    if (!match) return;

    if (match.aao && match.aka) {
      ScoreboardController.loadMatch(boutId, matchNumber);
    } else if (match.aao || match.aka) {
      if (BracketEngine.canAdvanceBye(bracket, matchNumber)) {
        this.advanceBye(boutId, matchNumber);
      }
    }
  },

  advanceBye(boutId, matchNumber) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    BracketEngine.advanceByeMatch(bracket, matchNumber);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
    
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  },

  undoMatch(boutId, matchNumber) {
    if (!confirm(`Are you sure you want to undo Match #${matchNumber} and reset downstream winners?`)) return;

    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    BracketEngine.undoMatch(bracket, matchNumber);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');

    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  },

  openSlotModal(boutId, slotIndex) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    const participant = bracket.slots[slotIndex];
    const matchNum = Math.floor(slotIndex / 2) + 1;
    const side = slotIndex % 2 === 0 ? 'AAO' : 'AKA';

    const otherBouts = SyncService.state.bouts;
    const boutOptions = otherBouts.map(b => `<option value="${b.id}" ${b.id === boutId ? 'selected' : ''}>${b.boutName}</option>`).join('');

    const slotOptions = Array.from({ length: 16 }, (_, i) => {
      const matchN = Math.floor(i / 2) + 1;
      const s = i % 2 === 0 ? 'AAO' : 'AKA';
      const occ = bracket.slots[i] ? bracket.slots[i].name : 'BYE';
      return `<option value="${i}" ${i === slotIndex ? 'disabled' : ''}>Slot ${i + 1} (Match ${matchN} ${s}): ${occ}</option>`;
    }).join('');

    const modalHtml = `
      <div class="modal fade" id="slotEditModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-2 border-primary">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title">Edit Slot ${slotIndex + 1} (Match #${matchNum} ${side})</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              ${participant ? `
                <div class="card mb-3 p-2 bg-light">
                  <h6 class="fw-bold mb-1">${participant.name}</h6>
                  <small class="text-muted">Branch: ${participant.branch || 'Dojo'} | Belt: ${participant.beltLabel || 'White'}</small>
                </div>
              ` : `
                <div class="alert alert-warning py-2 small">This slot is currently BYE (Empty).</div>
              `}

              <!-- TAB 1: SWAP WITHIN SAME BOUT SHEET -->
              <h6 class="fw-bold text-primary mt-3">1. Swap with another Slot in this Bout:</h6>
              <div class="input-group mb-3">
                <select id="swapTargetSlotSelect" class="form-select">${slotOptions}</select>
                <button class="btn btn-primary" onclick="BoutEditor.confirmSwapSlot('${boutId}', ${slotIndex})">Swap</button>
              </div>

              <!-- TAB 2: MOVE TO ANOTHER BOUT SHEET -->
              <h6 class="fw-bold text-primary mt-3">2. Move Participant to Another Bout Sheet:</h6>
              <div class="mb-2">
                <label class="form-label small mb-1">Target Bout Sheet:</label>
                <select id="moveTargetBoutSelect" class="form-select form-select-sm">${boutOptions}</select>
              </div>
              <div class="mb-3">
                <label class="form-label small mb-1">Target Slot Number (1 to 16):</label>
                <select id="moveTargetSlotSelect" class="form-select form-select-sm">
                  ${Array.from({ length: 16 }, (_, i) => `<option value="${i}">Slot ${i + 1}</option>`).join('')}
                </select>
              </div>
              <button class="btn btn-warning text-dark fw-bold w-100 mb-3" onclick="BoutEditor.confirmMoveBout('${boutId}', ${slotIndex})">Move Participant to Selected Bout Sheet</button>

              <!-- TAB 3: EDIT PARTICIPANT DETAILS OR ADD LATE ENTRY -->
              <h6 class="fw-bold text-primary border-top pt-2">3. ${participant ? 'Edit Details' : 'Add Late Entry Participant'}:</h6>
              <div class="mb-2">
                <input type="text" id="editParticipantName" class="form-control form-control-sm" placeholder="Participant Name" value="${participant ? participant.name : ''}">
              </div>
              <div class="mb-2">
                <input type="text" id="editParticipantBranch" class="form-control form-control-sm" placeholder="Branch / Dojo" value="${participant ? (participant.branch || '') : ''}">
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-success btn-sm flex-grow-1" onclick="BoutEditor.confirmSaveParticipant('${boutId}', ${slotIndex})">Save Participant</button>
                ${participant ? `
                  <button class="btn btn-danger btn-sm" onclick="BoutEditor.confirmRemoveParticipant('${boutId}', ${slotIndex})">Clear Slot (BYE)</button>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    const modal = new bootstrap.Modal(document.getElementById('slotEditModal'));
    modal.show();
  },

  confirmSwapSlot(boutId, slotIndex) {
    const targetSlotIdx = parseInt(document.getElementById('swapTargetSlotSelect').value, 10);
    SyncService.swapBracketSlots(boutId, slotIndex, targetSlotIdx);

    bootstrap.Modal.getInstance(document.getElementById('slotEditModal')).hide();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  confirmMoveBout(sourceBoutId, sourceSlotIdx) {
    const targetBoutId = document.getElementById('moveTargetBoutSelect').value;
    const targetSlotIdx = parseInt(document.getElementById('moveTargetSlotSelect').value, 10);

    SyncService.moveParticipantToBout(sourceBoutId, sourceSlotIdx, targetBoutId, targetSlotIdx);

    bootstrap.Modal.getInstance(document.getElementById('slotEditModal')).hide();
    this.renderBoutSheet(sourceBoutId, 'activeBoutDiagramContainer');
  },

  confirmSaveParticipant(boutId, slotIndex) {
    const name = document.getElementById('editParticipantName').value.trim();
    const branch = document.getElementById('editParticipantBranch').value.trim();

    if (!name) return alert('Participant name is required!');

    SyncService.updateSlotParticipant(boutId, slotIndex, { name, branch });

    bootstrap.Modal.getInstance(document.getElementById('slotEditModal')).hide();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  confirmRemoveParticipant(boutId, slotIndex) {
    if (!confirm('Are you sure you want to remove this participant and clear this slot to BYE?')) return;

    SyncService.updateSlotParticipant(boutId, slotIndex, null);

    bootstrap.Modal.getInstance(document.getElementById('slotEditModal')).hide();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  openQuickSwapModal(boutId) {
    this.openSlotModal(boutId, 0);
  },

  openAddParticipantModal(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;
    const emptySlotIdx = bracket.slots.findIndex(s => s === null);
    this.openSlotModal(boutId, emptySlotIdx !== -1 ? emptySlotIdx : 0);
  }
};

window.BoutEditor = BoutEditor;
