/**
 * 16-Slot Interactive Bout Sheet Editor & Official Diagram Renderer
 * Supports Drag/Drop, Slot Swapping, Participant Re-assignment, Late Entry Editing, Undo Match, and 1-Page Landscape PDF Export
 */

const BoutEditor = {
  activeBoutId: null,
  isEditMode: false,

  cleanParticipantName(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/^\s*[\(\[\{]\s*[YNyn]\s*[\)\]\}]\s*/i, '') // Strips leading (Y), (N), [Y], [N], etc.
      .replace(/^\s*[YNyn]\s*[-\/:;]\s*/i, '')             // Strips leading Y -, N -, Y:, N:, etc.
      .replace(/\s*[\(\[\{]\s*[YNyn]\s*[\)\]\}]\s*$/i, '') // Strips trailing (Y), (N), [Y], [N], etc.
      .replace(/\s*[-\/:;]\s*[YNyn]\s*$/i, '')             // Strips trailing - Y, - N, etc.
      .trim();
  },

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
          <div class="fighter-name-container flex-grow-1">
            <span class="badge bg-secondary me-1 align-middle">${label}</span>
            <span class="fw-bold align-middle">${this.cleanParticipantName(slotParticipant.name)}</span>
          </div>
          ${(isOrganizer && this.isEditMode && slotIndex !== undefined) ? `
            <button class="btn btn-xs btn-light py-0 px-1 ms-1 border fs-7 print-hide flex-shrink-0" onclick="event.stopPropagation(); BoutEditor.openSlotModal('${bracket.boutId}', ${slotIndex})">⚙️</button>
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
        ${(() => {
          const medals = bracket.medals || {};
          const goldName = medals.gold ? this.cleanParticipantName(medals.gold.name) : '_______';
          const silverName = medals.silver ? this.cleanParticipantName(medals.silver.name) : '_______';
          const bronze1Name = medals.bronze1 ? this.cleanParticipantName(medals.bronze1.name) : '_______';
          const bronze2Name = medals.bronze2 ? this.cleanParticipantName(medals.bronze2.name) : '_______';
          return `
            <div class="border-top mt-2 pt-2">
              <div class="row text-center fw-bold fs-6 mb-2">
                <div class="col-3 text-warning">🥇 GOLD: <span class="text-dark">${goldName}</span></div>
                <div class="col-3 text-secondary">🥈 SILVER: <span class="text-dark">${silverName}</span></div>
                <div class="col-3 text-danger">🥉 BRONZE 1: <span class="text-dark">${bronze1Name}</span></div>
                <div class="col-3 text-danger">🥉 BRONZE 2: <span class="text-dark">${bronze2Name}</span></div>
              </div>
          `;
        })()}
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
      <!-- Top Action Toolbar (PDF Export, Print & Submit) -->
      <div class="d-flex justify-content-between align-items-center mb-3 bg-light p-2 rounded border print-hide">
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <button class="btn btn-danger btn-sm fw-bold" onclick="BoutEditor.downloadBoutPDF('${boutId}')">📄 Download PDF (1 Page)</button>
          <button class="btn btn-warning text-dark btn-sm fw-bold" onclick="BoutEditor.downloadAllBoutsPDF()">📥 Download All Bout Sheets PDF</button>
          <button class="btn btn-secondary btn-sm fw-bold" onclick="BoutEditor.printBoutSheet()">🖨️ Print Sheet</button>
          ${bracket.eventType === 'Kata' ? `
            <button id="finishKataBtn_${boutId}" class="btn btn-primary btn-sm fw-bold px-3 shadow-sm" onclick="BoutEditor.finishKataRound('${boutId}')">🏁 Calculate & Finish Round 1</button>
          ` : ''}
          <button id="submitBtn_${boutId}" class="btn btn-success btn-sm fw-bold px-3 shadow-sm" onclick="BoutEditor.submitAndFinishBout('${boutId}')">💾 Submit / Finish Bout</button>
        </div>
        ${isOrganizer ? `
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm ${this.isEditMode ? 'btn-warning text-dark fw-bold' : 'btn-outline-dark'}" onclick="BoutEditor.toggleEditMode()">
              ${this.isEditMode ? '✏️ Exit Edit Mode' : '✏️ Enable Edit & Reassign Mode'}
            </button>
            ${this.isEditMode ? `
              <button class="btn btn-sm btn-success" onclick="${bracket.eventType === 'Kata' ? `BoutEditor.openAddKataCompetitorModal('${boutId}')` : `BoutEditor.openAddParticipantModal('${boutId}')`}">➕ Add Late Entry</button>
              ${bracket.eventType !== 'Kata' ? `<button class="btn btn-sm btn-info text-white" onclick="BoutEditor.openQuickSwapModal('${boutId}')">🔀 Quick Swap Slots</button>` : ''}
            ` : ''}
          </div>
        ` : ''}
      </div>

      <div id="submitBoutStatus_${boutId}" style="display: none;"></div>

      ${bracket.eventType === 'Kata' ? this.generateKataScoreSheetHTML(bracket, isOrganizer) : this.generateBoutSheetHTML(bracket, isOrganizer)}
    `;

    const activeEl = document.activeElement;
    const activeId = (activeEl && activeEl.id) ? activeEl.id : null;
    const selStart = (activeEl && typeof activeEl.selectionStart === 'number') ? activeEl.selectionStart : null;
    const selEnd = (activeEl && typeof activeEl.selectionEnd === 'number') ? activeEl.selectionEnd : null;

    container.innerHTML = html;

    if (activeId) {
      const newEl = document.getElementById(activeId);
      if (newEl) {
        newEl.focus();
        if (selStart !== null && selEnd !== null) {
          try { newEl.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }
  },

  finishKataRound(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    // 1. Read all Main Kata Table inputs from DOM
    if (Array.isArray(bracket.competitors)) {
      bracket.competitors.forEach(comp => {
        if (!Array.isArray(comp.scores) || comp.scores.length !== 5) {
          comp.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
        }
        if (!Array.isArray(comp.refereeTouched) || comp.refereeTouched.length !== 5) {
          comp.refereeTouched = [false, false, false, false, false];
        }

        [0, 1, 2, 3, 4].forEach(refIdx => {
          const inputEl = document.getElementById(`kataInput_${boutId}_${comp.id}_${refIdx}`);
          if (inputEl) {
            const val = inputEl.value;
            if (val !== '' || inputEl.dataset.touched === 'true') {
              const num = parseFloat(val);
              comp.scores[refIdx] = isNaN(num) ? 5.0 : num;
              comp.refereeTouched[refIdx] = true;
            }
          }
        });
        comp.hasScored = comp.refereeTouched.some(t => t);
      });
    }

    // 2. Read all 3+ Way Re-score Round table inputs from DOM if active
    if (bracket.tieBreaker && bracket.tieBreaker.rescoreRound && Array.isArray(bracket.tieBreaker.rescoreRound.competitors)) {
      bracket.tieBreaker.rescoreRound.competitors.forEach(rc => {
        if (!Array.isArray(rc.scores) || rc.scores.length !== 5) {
          rc.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
        }
        if (!Array.isArray(rc.refereeTouched) || rc.refereeTouched.length !== 5) {
          rc.refereeTouched = [false, false, false, false, false];
        }

        [0, 1, 2, 3, 4].forEach(refIdx => {
          const inputEl = document.getElementById(`kataRescoreInput_${boutId}_${rc.id}_${refIdx}`);
          if (inputEl) {
            const val = inputEl.value;
            if (val !== '' || inputEl.dataset.touched === 'true') {
              const num = parseFloat(val);
              rc.scores[refIdx] = isNaN(num) ? 5.0 : num;
              rc.refereeTouched[refIdx] = true;
            }
          }
        });
        rc.hasScored = rc.refereeTouched.some(t => t);
      });
    }

    // 3. Recalculate ranks, check completion, and save/broadcast
    SyncService.lastLocalEditTime = Date.now();
    BracketEngine.recalculateKataRanks(bracket);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocal();
    SyncService.pushToAivenDB();
    SyncService.stopBoutScoring();

    // 4. Re-render bout sheet
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  },

  async submitAndFinishBout(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return alert('Bout sheet not found!');

    if (bracket.eventType === 'Kata') {
      this.finishKataRound(boutId);
    }

    const btn = document.getElementById(`submitBtn_${boutId}`);
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '⏳ Submitting...';
    }

    SyncService.checkBoutCompletion(boutId);
    const ok = await SyncService.submitBoutToServer(boutId);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '💾 Submit / Finish Bout';
    }

    const bout = SyncService.state.bouts.find(b => b.id === boutId);
    const statusText = bout ? bout.status : 'Saved';

    const statusEl = document.getElementById(`submitBoutStatus_${boutId}`);
    if (statusEl) {
      statusEl.className = 'alert alert-success alert-dismissible fade show my-2 py-2 fs-7 print-hide shadow-sm';
      statusEl.innerHTML = `
        <strong>✅ Bout Results Submitted Successfully!</strong> Results for "${bracket.boutName}" have been saved and synced to the cloud server. Current Status: <strong>${statusText}</strong>.
        <button type="button" class="btn-close py-2" data-bs-dismiss="alert"></button>
      `;
      statusEl.style.display = 'block';
    } else {
      alert(`✅ Bout results for "${bracket.boutName}" submitted and saved to cloud server!`);
    }

    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
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
                  <small class="text-muted">Belt: ${participant.beltLabel || 'White'}</small>
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
    const emptySlotIdx = bracket.slots ? bracket.slots.findIndex(s => s === null) : -1;
    this.openSlotModal(boutId, emptySlotIdx !== -1 ? emptySlotIdx : 0);
  },

  generateKataScoreSheetHTML(bracket, isOrganizer) {
    const competitors = bracket.competitors || [];
    const medals = bracket.medals || {};
    const tieBreaker = bracket.tieBreaker || {};

    const user = AuthService.currentUser;
    const isAssignedTatami = user && user.role === 'tatami' && (!bracket.tatamiId || bracket.tatamiId === user.tatamiId);
    const canScoreKata = isOrganizer || isAssignedTatami;

    const goldName = medals.gold ? medals.gold.name : '_______';
    const silverName = medals.silver ? medals.silver.name : '_______';
    const bronze1Name = medals.bronze1 ? medals.bronze1.name : '_______';
    const bronze2Name = medals.bronze2 ? medals.bronze2.name : '_______';

    const activeTie = tieBreaker.activeTie || (
      (tieBreaker.rescoreRound && !tieBreaker.flagVote) ? '3WAY_RESCORE' :
      (tieBreaker.flagVote ? '2WAY_FLAG' : null)
    );

    if (activeTie) {
      SyncService.startBoutScoring(bracket.boutId);
    }

    // 2-Way Flag Vote UI ONLY
    let flagVoteCardHTML = '';
    if (activeTie === '2WAY_FLAG' && tieBreaker.flagVote && !tieBreaker.flagVote.winnerId) {
      const tiedComps = competitors.filter(c => tieBreaker.flagVote.tiedIds.includes(c.id));
      if (tiedComps.length === 2) {
        flagVoteCardHTML = `
          <div class="card border-warning my-3 p-3 bg-light print-hide shadow-sm">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="fw-bold text-dark m-0">⚠️ 2-WAY TIE DETECTED FOR MEDAL POSITION</h6>
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-warning text-dark">Flag Vote Required</span>
                ${canScoreKata ? `
                  <button class="btn btn-outline-danger btn-sm py-0 px-2 fw-bold" onclick="BoutEditor.undoKataTieBreaker('${bracket.boutId}')">↩️ Undo Tie-Breaker</button>
                ` : ''}
              </div>
            </div>
            <p class="small text-muted mb-2">Referees cast AKA or AAO flag vote to break tie between <strong>${this.cleanParticipantName(tiedComps[0].name)}</strong> and <strong>${this.cleanParticipantName(tiedComps[1].name)}</strong>:</p>
            <div class="d-flex gap-3 justify-content-center">
              <button class="btn btn-danger fw-bold px-4 fs-6" onclick="BoutEditor.castKataFlagVote('${bracket.boutId}', '${tiedComps[0].id}')">
                🔴 VOTE AKA: ${this.cleanParticipantName(tiedComps[0].name)}
              </button>
              <button class="btn btn-primary fw-bold px-4 fs-6" onclick="BoutEditor.castKataFlagVote('${bracket.boutId}', '${tiedComps[1].id}')">
                🔵 VOTE AAO: ${this.cleanParticipantName(tiedComps[1].name)}
              </button>
            </div>
          </div>
        `;
      }
    }

    // 3+ Way Re-Score Round UI ONLY
    let rescoreRoundHTML = '';
    if (activeTie === '3WAY_RESCORE' && tieBreaker.rescoreRound) {
      const rescoreComps = tieBreaker.rescoreRound.competitors || [];
      rescoreRoundHTML = `
        <div class="card border-danger my-3 p-3 bg-white print-hide shadow-sm">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="fw-bold text-danger m-0">🔥 3+ WAY TIE - RE-SCORING ROUND (TIED CONTESTANTS ONLY)</h6>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-danger">Scoped Re-Score</span>
              ${canScoreKata ? `
                <button class="btn btn-outline-dark btn-sm py-0 px-2 fw-bold" onclick="BoutEditor.undoKataTieBreaker('${bracket.boutId}')">↩️ Reset Re-Scores</button>
              ` : ''}
            </div>
          </div>
          <table class="table table-sm table-bordered align-middle text-center mb-0">
            <thead class="table-dark">
              <tr>
                <th style="width: 50px;">NO.</th>
                <th>TIED COMPETITOR NAME</th>
                <th style="width: 75px;">REF 1</th>
                <th style="width: 75px;">REF 2</th>
                <th style="width: 75px;">REF 3</th>
                <th style="width: 75px;">REF 4</th>
                <th style="width: 75px;">REF 5</th>
                <th style="width: 90px;">RE-TOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${rescoreComps.map((rc, idx) => `
                <tr>
                  <td class="fw-bold">${idx + 1}</td>
                  <td class="text-start fw-bold">${this.cleanParticipantName(rc.name)}</td>
                  ${[0, 1, 2, 3, 4].map(refIdx => {
                    const scoreVal = (rc.scores && rc.scores[refIdx] !== undefined && rc.scores[refIdx] !== null) ? Number(rc.scores[refIdx]).toFixed(1) : '5.0';
                    return `
                      <td>
                        ${canScoreKata ? `
                          <input type="number" step="0.1" min="0" max="10" 
                            id="kataRescoreInput_${bracket.boutId}_${rc.id}_${refIdx}"
                            class="form-control form-control-sm text-center py-0 px-1 fs-7" 
                            value="${scoreVal}" 
                            onfocus="BoutEditor.onKataRescoreFocus('${bracket.boutId}', '${rc.id}', ${refIdx})"
                            onclick="BoutEditor.onKataRescoreFocus('${bracket.boutId}', '${rc.id}', ${refIdx})"
                            oninput="BoutEditor.updateKataRescore('${bracket.boutId}', '${rc.id}', ${refIdx}, this.value)"
                            onchange="BoutEditor.updateKataRescore('${bracket.boutId}', '${rc.id}', ${refIdx}, this.value)">
                        ` : `
                          <span class="fw-semibold">${scoreVal}</span>
                        `}
                      </td>
                    `;
                  }).join('')}
                  <td class="fw-bold text-danger fs-6 kata-rescore-total-${rc.id}">${rc.hasScored && rc.totalScore ? rc.totalScore.toFixed(2) : '0.00'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${canScoreKata ? `
            <div class="text-end mt-2 pt-2 border-top">
              <button class="btn btn-danger btn-sm fw-bold px-3 shadow-sm" onclick="BoutEditor.finishKataRescoreRound('${bracket.boutId}')">
                🏁 Calculate & Finish Re-Score Round
              </button>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Official Score Sheet Printed Rows (Pad up to 12 rows for clear print layout)
    const displayRows = [...competitors];
    while (displayRows.length < 12) {
      displayRows.push(null);
    }

    return `
      <div class="bout-sheet-printable shadow-sm p-3 bg-white text-dark rounded">
        <!-- Sheet Header -->
        <div class="text-center border-bottom pb-2 mb-2">
          <h3 class="fw-bold tracking-wide m-0">SHOTOKAN KARATE CHAMPIONSHIP</h3>
          <h5 class="fw-bold text-danger m-0 mt-1">OFFICIAL KATA SCORE SHEET</h5>
          <div class="row g-1 text-start fw-bold mt-2" style="font-size: 0.9rem;">
            <div class="col-md-3">Age/Category: <span class="text-primary">${bracket.boutName}</span></div>
            <div class="col-md-3">Arena No: <span class="text-primary">Tatami ${bracket.tatamiId || 'Unassigned'}</span></div>
            <div class="col-md-3">Belt Category: <span class="text-primary">${bracket.beltTier}</span></div>
            <div class="col-md-3">Gender: <span class="text-primary">${bracket.gender}</span></div>
          </div>
        </div>

        ${flagVoteCardHTML}
        ${rescoreRoundHTML}

        <!-- Main Kata Table -->
        <div class="table-responsive my-2">
          <table class="table table-bordered table-sm align-middle text-center mb-0" style="font-size: 0.88rem;">
            <thead class="table-light">
              <tr class="fw-bold">
                <th style="width: 45px;">NO.</th>
                <th class="text-start">NAME OF PARTICIPANT</th>
                <th style="width: 75px;">REF 1</th>
                <th style="width: 75px;">REF 2</th>
                <th style="width: 75px;">REF 3</th>
                <th style="width: 75px;">REF 4</th>
                <th style="width: 75px;">REF 5</th>
                <th style="width: 85px;">TOTAL</th>
                <th style="width: 75px;">PLACE</th>
              </tr>
            </thead>
            <tbody>
              ${displayRows.map((comp, idx) => {
                if (!comp) {
                  return `
                    <tr style="height: 32px;">
                      <td class="text-muted fs-7">${idx + 1}</td>
                      <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                    </tr>
                  `;
                }

                const placeLabel = (comp.hasScored && comp.place) ? (
                  comp.place === 1 ? '🥇 1st' :
                  comp.place === 2 ? '🥈 2nd' :
                  comp.place === 3 ? '🥉 3rd' :
                  comp.place === 4 ? '🥉 3rd' : `${comp.place}th`
                ) : '-';

                const placeClass = (comp.hasScored && comp.place) ? (comp.place <= 2 ? 'fw-bold text-success' : (comp.place <= 4 ? 'fw-bold text-warning text-dark' : '')) : '';

                return `
                  <tr>
                    <td class="fw-bold">${idx + 1}</td>
                    <td class="text-start">
                      <div class="d-flex justify-content-between align-items-center">
                        <div>
                          <span class="fw-bold">${this.cleanParticipantName(comp.name)}</span>
                        </div>
                        ${(isOrganizer && this.isEditMode) ? `
                          <button class="btn btn-xs btn-light py-0 px-1 ms-1 border fs-7 print-hide flex-shrink-0" onclick="event.stopPropagation(); BoutEditor.openKataCompetitorModal('${bracket.boutId}', '${comp.id}')">⚙️</button>
                        ` : ''}
                      </div>
                    </td>
                    ${[0, 1, 2, 3, 4].map(refIdx => {
                      const scoreVal = (comp.scores && comp.scores[refIdx] !== undefined && comp.scores[refIdx] !== null) ? Number(comp.scores[refIdx]).toFixed(1) : '5.0';
                      return `
                        <td>
                          ${canScoreKata ? `
                            <input type="number" step="0.1" min="0" max="10" 
                              id="kataInput_${bracket.boutId}_${comp.id}_${refIdx}"
                              class="form-control form-control-sm text-center py-0 px-1 fs-7"
                              value="${scoreVal}" 
                              onfocus="BoutEditor.onKataScoreFocus('${bracket.boutId}', '${comp.id}', ${refIdx})"
                              onclick="BoutEditor.onKataScoreFocus('${bracket.boutId}', '${comp.id}', ${refIdx})"
                              oninput="BoutEditor.updateKataScore('${bracket.boutId}', '${comp.id}', ${refIdx}, this.value)"
                              onchange="BoutEditor.updateKataScore('${bracket.boutId}', '${comp.id}', ${refIdx}, this.value)">
                          ` : `
                            <span class="fw-semibold">${scoreVal}</span>
                          `}
                        </td>
                      `;
                    }).join('')}
                    <td class="fw-bold fs-6 text-primary kata-total-${comp.id}">${comp.hasScored && comp.totalScore ? comp.totalScore.toFixed(2) : '0.00'}</td>
                    <td class="kata-place-${comp.id} ${placeClass} fs-6">${placeLabel}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- MEDALS & REFEREES FOOTER -->
        <div class="border-top mt-3 pt-2 kata-medals-footer-${bracket.boutId}">
          <div class="row text-center fw-bold fs-6 mb-2">
            <div class="col-3 text-warning">🥇 GOLD: <span class="text-dark">${goldName}</span></div>
            <div class="col-3 text-secondary">🥈 SILVER: <span class="text-dark">${silverName}</span></div>
            <div class="col-3 text-danger">🥉 BRONZE 1: <span class="text-dark">${bronze1Name}</span></div>
            <div class="col-3 text-danger">🥉 BRONZE 2: <span class="text-dark">${bronze2Name}</span></div>
          </div>
          <div class="d-flex justify-content-between text-muted fs-7 border-top pt-2">
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

  onKataScoreFocus(boutId, compId, refIndex) {
    SyncService.startBoutScoring(boutId);
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const comp = bracket.competitors.find(c => c.id === compId);
    if (!comp) return;

    if (!Array.isArray(comp.refereeTouched) || comp.refereeTouched.length !== 5) {
      comp.refereeTouched = [false, false, false, false, false];
    }

    if (refIndex !== undefined && refIndex !== null && !comp.refereeTouched[refIndex]) {
      comp.refereeTouched[refIndex] = true;
      comp.hasScored = true;
      if (!Array.isArray(comp.scores) || comp.scores.length !== 5) {
        comp.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
      }
      BracketEngine.recalculateKataRanks(bracket);
      SyncService.checkBoutCompletion(boutId);
      SyncService.saveToLocalOnly();
      this.updateKataDOM(boutId);
    }
  },

  updateKataScore(boutId, compId, refIndex, val) {
    SyncService.startBoutScoring(boutId);
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const comp = bracket.competitors.find(c => c.id === compId);
    if (!comp) return;

    if (!Array.isArray(comp.refereeTouched) || comp.refereeTouched.length !== 5) {
      comp.refereeTouched = [false, false, false, false, false];
    }
    comp.refereeTouched[refIndex] = true;
    comp.hasScored = true;

    if (!Array.isArray(comp.scores) || comp.scores.length !== 5) {
      comp.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
    }

    const scoreNum = val === '' ? 5.0 : (parseFloat(val) || 0);
    comp.scores[refIndex] = scoreNum;

    const prevActiveTie = bracket.tieBreaker ? bracket.tieBreaker.activeTie : null;
    BracketEngine.recalculateKataRanks(bracket);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocalOnly();

    const newActiveTie = bracket.tieBreaker ? bracket.tieBreaker.activeTie : null;
    if (prevActiveTie !== newActiveTie) {
      this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
      const ringContainer = document.getElementById('ringBoutContainer');
      if (ringContainer) {
        this.renderBoutSheet(boutId, 'ringBoutContainer');
      }
    } else {
      this.updateKataDOM(boutId);
    }
  },

  updateKataDOM(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    bracket.competitors.forEach(comp => {
      const totalEls = document.querySelectorAll(`.kata-total-${comp.id}`);
      totalEls.forEach(el => {
        el.textContent = (comp.hasScored && comp.totalScore) ? comp.totalScore.toFixed(2) : '0.00';
      });

      const placeEls = document.querySelectorAll(`.kata-place-${comp.id}`);
      placeEls.forEach(el => {
        const placeLabel = (comp.hasScored && comp.place) ? (
          comp.place === 1 ? '🥇 1st' :
          comp.place === 2 ? '🥈 2nd' :
          comp.place === 3 ? '🥉 3rd' :
          comp.place === 4 ? '🥉 3rd' : `${comp.place}th`
        ) : '-';

        const placeClass = (comp.hasScored && comp.place) ? (comp.place <= 2 ? 'fw-bold text-success' : (comp.place <= 4 ? 'fw-bold text-warning text-dark' : '')) : '';
        el.textContent = placeLabel;
        el.className = `kata-place-${comp.id} ${placeClass} fs-6`;
      });
    });

    const footerEls = document.querySelectorAll(`.kata-medals-footer-${bracket.boutId}`);
    if (footerEls.length > 0) {
      const medals = bracket.medals || {};
      const goldName = medals.gold ? this.cleanParticipantName(medals.gold.name) : '_______';
      const silverName = medals.silver ? this.cleanParticipantName(medals.silver.name) : '_______';
      const bronze1Name = medals.bronze1 ? this.cleanParticipantName(medals.bronze1.name) : '_______';
      const bronze2Name = medals.bronze2 ? this.cleanParticipantName(medals.bronze2.name) : '_______';

      const footerHTML = `
        <div class="row text-center fw-bold fs-6 mb-2">
          <div class="col-3 text-warning">🥇 GOLD: <span class="text-dark">${goldName}</span></div>
          <div class="col-3 text-secondary">🥈 SILVER: <span class="text-dark">${silverName}</span></div>
          <div class="col-3 text-danger">🥉 BRONZE 1: <span class="text-dark">${bronze1Name}</span></div>
          <div class="col-3 text-danger">🥉 BRONZE 2: <span class="text-dark">${bronze2Name}</span></div>
        </div>
        <div class="d-flex justify-content-between text-muted fs-7 border-top pt-2">
          <span>Referee 1: ____________</span>
          <span>Referee 2: ____________</span>
          <span>Referee 3: ____________</span>
          <span>Referee 4: ____________</span>
          <span>Referee 5: ____________</span>
        </div>
      `;

      footerEls.forEach(el => el.innerHTML = footerHTML);
    }

    if (bracket.tieBreaker && bracket.tieBreaker.rescoreRound && bracket.tieBreaker.rescoreRound.competitors) {
      bracket.tieBreaker.rescoreRound.competitors.forEach(rc => {
        const rescoreTotalEls = document.querySelectorAll(`.kata-rescore-total-${rc.id}`);
        rescoreTotalEls.forEach(el => {
          el.textContent = (rc.hasScored && rc.totalScore) ? rc.totalScore.toFixed(2) : '0.00';
        });
      });
    }
  },

  castKataFlagVote(boutId, winnerId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata' || !bracket.tieBreaker.flagVote) return;

    bracket.tieBreaker.flagVote.winnerId = winnerId;
    SyncService.lastLocalEditTime = Date.now();
    BracketEngine.recalculateKataRanks(bracket);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocal();
    SyncService.pushToAivenDB();
    SyncService.stopBoutScoring();

    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  },

  onKataRescoreFocus(boutId, compId, refIndex) {
    SyncService.startBoutScoring(boutId);
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata' || !bracket.tieBreaker || !bracket.tieBreaker.rescoreRound) return;

    const rc = bracket.tieBreaker.rescoreRound.competitors.find(c => c.id === compId);
    if (!rc) return;

    if (!Array.isArray(rc.refereeTouched) || rc.refereeTouched.length !== 5) {
      rc.refereeTouched = [false, false, false, false, false];
    }

    if (refIndex !== undefined && refIndex !== null && !rc.refereeTouched[refIndex]) {
      rc.refereeTouched[refIndex] = true;
      rc.hasScored = true;
      if (!Array.isArray(rc.scores) || rc.scores.length !== 5) {
        rc.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
      }
      BracketEngine.recalculateKataRanks(bracket);
      SyncService.checkBoutCompletion(boutId);
      SyncService.saveToLocalOnly();
      this.updateKataDOM(boutId);
    }
  },

  updateKataRescore(boutId, compId, refIndex, val) {
    SyncService.startBoutScoring(boutId);
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata' || !bracket.tieBreaker || !bracket.tieBreaker.rescoreRound) return;

    const rc = bracket.tieBreaker.rescoreRound.competitors.find(c => c.id === compId);
    if (!rc) return;

    if (!Array.isArray(rc.refereeTouched) || rc.refereeTouched.length !== 5) {
      rc.refereeTouched = [false, false, false, false, false];
    }
    rc.refereeTouched[refIndex] = true;
    rc.hasScored = true;

    if (!Array.isArray(rc.scores) || rc.scores.length !== 5) {
      rc.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
    }

    const scoreNum = val === '' ? 5.0 : (parseFloat(val) || 0);
    rc.scores[refIndex] = scoreNum;

    const prevActiveTie = bracket.tieBreaker ? bracket.tieBreaker.activeTie : null;
    BracketEngine.recalculateKataRanks(bracket);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocalOnly();

    const newActiveTie = bracket.tieBreaker ? bracket.tieBreaker.activeTie : null;
    if (prevActiveTie !== newActiveTie) {
      this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
      const ringContainer = document.getElementById('ringBoutContainer');
      if (ringContainer) {
        this.renderBoutSheet(boutId, 'ringBoutContainer');
      }
    } else {
      this.updateKataDOM(boutId);
    }
  },

  finishKataRescoreRound(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata' || !bracket.tieBreaker || !bracket.tieBreaker.rescoreRound) return;

    if (Array.isArray(bracket.tieBreaker.rescoreRound.competitors)) {
      bracket.tieBreaker.rescoreRound.competitors.forEach(rc => {
        if (!Array.isArray(rc.scores) || rc.scores.length !== 5) {
          rc.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
        }
        if (!Array.isArray(rc.refereeTouched) || rc.refereeTouched.length !== 5) {
          rc.refereeTouched = [false, false, false, false, false];
        }

        [0, 1, 2, 3, 4].forEach(refIdx => {
          const inputEl = document.getElementById(`kataRescoreInput_${boutId}_${rc.id}_${refIdx}`);
          if (inputEl) {
            const val = inputEl.value;
            if (val !== '' || inputEl.dataset.touched === 'true') {
              const num = parseFloat(val);
              rc.scores[refIdx] = isNaN(num) ? 5.0 : num;
              rc.refereeTouched[refIdx] = true;
            }
          }
        });
        rc.hasScored = rc.refereeTouched.some(t => t);
      });
    }

    SyncService.lastLocalEditTime = Date.now();
    BracketEngine.recalculateKataRanks(bracket);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocal();
    SyncService.pushToAivenDB();
    SyncService.stopBoutScoring();

    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  },

  undoKataTieBreaker(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata' || !bracket.tieBreaker) return;

    if (!confirm('Are you sure you want to reset/undo the active tie-breaker for this Kata sheet?')) return;

    if (bracket.tieBreaker.flagVote) {
      bracket.tieBreaker.flagVote = null;
      if (bracket.tieBreaker.rescoreRound) {
        bracket.tieBreaker.activeTie = '3WAY_RESCORE';
      } else {
        bracket.tieBreaker.activeTie = null;
      }
    } else if (bracket.tieBreaker.rescoreRound) {
      bracket.tieBreaker.rescoreRound = null;
      bracket.tieBreaker.activeTie = null;
    }

    BracketEngine.recalculateKataRanks(bracket);
    SyncService.checkBoutCompletion(boutId);
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
    const ringContainer = document.getElementById('ringBoutContainer');
    if (ringContainer) {
      this.renderBoutSheet(boutId, 'ringBoutContainer');
    }
  },

  openKataCompetitorModal(boutId, compId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const compIndex = bracket.competitors.findIndex(c => c.id === compId);
    const comp = bracket.competitors[compIndex];
    if (!comp) return;

    const otherBouts = SyncService.state.bouts.filter(b => SyncService.state.brackets[b.id]?.eventType === 'Kata');
    const boutOptions = otherBouts.map(b => `<option value="${b.id}" ${b.id === boutId ? 'selected' : ''}>${b.boutName}</option>`).join('');

    const compOptions = bracket.competitors.map((c, i) => `
      <option value="${i}" ${i === compIndex ? 'disabled' : ''}>Position ${i + 1}: ${this.cleanParticipantName(c.name)}</option>
    `).join('');

    const modalHtml = `
      <div class="modal fade" id="kataCompetitorModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-2 border-primary">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title">Edit Kata Competitor #${compIndex + 1}</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="card mb-3 p-2 bg-light">
                <h6 class="fw-bold mb-1">${this.cleanParticipantName(comp.name)}</h6>
                <small class="text-muted">Age: ${comp.age || 'N/A'}</small>
              </div>

              <!-- 1. EDIT COMPETITOR DETAILS -->
              <h6 class="fw-bold text-primary">1. Edit Competitor Details:</h6>
              <div class="mb-2">
                <label class="form-label small mb-1">Full Name:</label>
                <input type="text" id="editKataCompName" class="form-control form-control-sm" value="${this.cleanParticipantName(comp.name)}">
              </div>
              <div class="mb-3">
                <label class="form-label small mb-1">Branch / Dojo:</label>
                <input type="text" id="editKataCompBranch" class="form-control form-control-sm" value="${comp.branch || ''}">
              </div>
              <button class="btn btn-success btn-sm w-100 mb-3 fw-bold" onclick="BoutEditor.confirmSaveKataCompetitor('${boutId}', '${compId}')">Save Details</button>

              <!-- 2. REORDER / SWAP POSITION -->
              <h6 class="fw-bold text-primary border-top pt-3">2. Swap Position in this Kata Sheet:</h6>
              <div class="input-group mb-3">
                <select id="swapKataTargetSelect" class="form-select form-select-sm">${compOptions}</select>
                <button class="btn btn-primary btn-sm fw-bold" onclick="BoutEditor.confirmSwapKataPosition('${boutId}', ${compIndex})">Swap Position</button>
              </div>

              <!-- 3. MOVE TO ANOTHER KATA SHEET -->
              <h6 class="fw-bold text-primary border-top pt-3">3. Move Competitor to Another Kata Sheet:</h6>
              <div class="mb-3">
                <label class="form-label small mb-1">Target Kata Sheet:</label>
                <select id="moveKataTargetBoutSelect" class="form-select form-select-sm">${boutOptions}</select>
              </div>
              <button class="btn btn-warning text-dark btn-sm fw-bold w-100 mb-3" onclick="BoutEditor.confirmMoveKataCompetitor('${boutId}', '${compId}')">Move Competitor</button>

              <!-- 4. DELETE / REMOVE -->
              <div class="border-top pt-2 text-end">
                <button class="btn btn-danger btn-sm" onclick="BoutEditor.confirmRemoveKataCompetitor('${boutId}', '${compId}')">🗑️ Remove Competitor</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    const modal = new bootstrap.Modal(document.getElementById('kataCompetitorModal'));
    modal.show();
  },

  openAddKataCompetitorModal(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const modalHtml = `
      <div class="modal fade" id="addKataCompetitorModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content border-2 border-success">
            <div class="modal-header bg-success text-white">
              <h5 class="modal-title">➕ Add Late Entry Kata Competitor</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div class="mb-2">
                <label class="form-label small mb-1">Full Name:</label>
                <input type="text" id="addKataCompName" class="form-control form-control-sm" placeholder="Enter Competitor Full Name">
              </div>
              <div class="mb-3">
                <label class="form-label small mb-1">Branch / Dojo:</label>
                <input type="text" id="addKataCompBranch" class="form-control form-control-sm" placeholder="Enter Branch / Dojo Name">
              </div>
              <button class="btn btn-success w-100 fw-bold" onclick="BoutEditor.confirmAddKataCompetitor('${boutId}')">Add Competitor to Kata Sheet</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    const modal = new bootstrap.Modal(document.getElementById('addKataCompetitorModal'));
    modal.show();
  },

  confirmSaveKataCompetitor(boutId, compId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const name = this.cleanParticipantName(document.getElementById('editKataCompName').value.trim());
    const branch = document.getElementById('editKataCompBranch').value.trim();

    if (!name) return alert('Competitor name is required!');

    const comp = bracket.competitors.find(c => c.id === compId);
    if (comp) {
      comp.name = name;
      comp.branch = branch;
    }

    bootstrap.Modal.getInstance(document.getElementById('kataCompetitorModal')).hide();
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  confirmSwapKataPosition(boutId, sourceIdx) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const targetIdx = parseInt(document.getElementById('swapKataTargetSelect').value, 10);
    if (isNaN(targetIdx) || targetIdx < 0 || targetIdx >= bracket.competitors.length) return;

    const temp = bracket.competitors[sourceIdx];
    bracket.competitors[sourceIdx] = bracket.competitors[targetIdx];
    bracket.competitors[targetIdx] = temp;

    // Renumber
    bracket.competitors.forEach((c, idx) => c.no = idx + 1);

    BracketEngine.recalculateKataRanks(bracket);
    bootstrap.Modal.getInstance(document.getElementById('kataCompetitorModal')).hide();
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  confirmMoveKataCompetitor(sourceBoutId, compId) {
    const targetBoutId = document.getElementById('moveKataTargetBoutSelect').value;
    if (sourceBoutId === targetBoutId) return alert('Target Kata sheet is the same as current sheet!');

    const sourceBracket = SyncService.state.brackets[sourceBoutId];
    const targetBracket = SyncService.state.brackets[targetBoutId];
    if (!sourceBracket || !targetBracket) return;

    const compIdx = sourceBracket.competitors.findIndex(c => c.id === compId);
    if (compIdx === -1) return;

    const [comp] = sourceBracket.competitors.splice(compIdx, 1);
    comp.no = targetBracket.competitors.length + 1;
    targetBracket.competitors.push(comp);

    // Renumber source and recalculate ranks
    sourceBracket.competitors.forEach((c, idx) => c.no = idx + 1);
    BracketEngine.recalculateKataRanks(sourceBracket);
    BracketEngine.recalculateKataRanks(targetBracket);

    bootstrap.Modal.getInstance(document.getElementById('kataCompetitorModal')).hide();
    SyncService.saveToLocal();
    this.renderBoutSheet(sourceBoutId, 'activeBoutDiagramContainer');
  },

  confirmRemoveKataCompetitor(boutId, compId) {
    if (!confirm('Are you sure you want to remove this competitor from this Kata sheet?')) return;

    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const compIdx = bracket.competitors.findIndex(c => c.id === compId);
    if (compIdx !== -1) {
      bracket.competitors.splice(compIdx, 1);
      bracket.competitors.forEach((c, idx) => c.no = idx + 1);
      BracketEngine.recalculateKataRanks(bracket);
    }

    bootstrap.Modal.getInstance(document.getElementById('kataCompetitorModal')).hide();
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  confirmAddKataCompetitor(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket || bracket.eventType !== 'Kata') return;

    const name = this.cleanParticipantName(document.getElementById('addKataCompName').value.trim());
    const branch = document.getElementById('addKataCompBranch').value.trim();

    if (!name) return alert('Competitor full name is required!');

    const newComp = {
      id: 'p_' + Math.random().toString(36).substr(2, 9),
      no: bracket.competitors.length + 1,
      name,
      branch: branch || 'Main Dojo',
      scores: [5.0, 5.0, 5.0, 5.0, 5.0],
      refereeTouched: [false, false, false, false, false],
      hasScored: false,
      totalScore: 0,
      place: null
    };

    bracket.competitors.push(newComp);
    BracketEngine.recalculateKataRanks(bracket);

    bootstrap.Modal.getInstance(document.getElementById('addKataCompetitorModal')).hide();
    SyncService.saveToLocal();
    this.renderBoutSheet(boutId, 'activeBoutDiagramContainer');
  },

  openCreateBoutModal() {
    if (!AuthService.currentUser || AuthService.currentUser.role !== 'organizer') {
      return alert('Access Denied: Only Tournament Organizer / Admin can create new bouts.');
    }

    const modalHtml = `
      <div class="modal fade" id="createBoutModal" data-bs-backdrop="static" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content shadow-lg border-2 border-primary">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title fw-bold">🥋 Create New Championship Bout (Kata / Kumite)</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4">
              <form id="createBoutForm" onsubmit="event.preventDefault(); BoutEditor.confirmCreateBout();">
                
                <!-- Event Type Selector -->
                <div class="mb-3">
                  <label class="form-label fw-bold">Select Event Type <span class="text-danger">*</span></label>
                  <div class="d-flex gap-3">
                    <div class="form-check form-check-inline bg-light p-3 border rounded flex-fill cursor-pointer" onclick="document.getElementById('eventTypeKumite').checked = true; BoutEditor.autoGenerateBoutName();">
                      <input class="form-check-input" type="radio" name="createEventType" id="eventTypeKumite" value="Kumite" checked onchange="BoutEditor.autoGenerateBoutName()">
                      <label class="form-check-label fw-bold text-danger fs-6" for="eventTypeKumite">
                        🥊 Kumite (Sparring Match)
                      </label>
                      <div class="small text-muted">16-slot double pool elimination bracket</div>
                    </div>
                    <div class="form-check form-check-inline bg-light p-3 border rounded flex-fill cursor-pointer" onclick="document.getElementById('eventTypeKata').checked = true; BoutEditor.autoGenerateBoutName();">
                      <input class="form-check-input" type="radio" name="createEventType" id="eventTypeKata" value="Kata" onchange="BoutEditor.autoGenerateBoutName()">
                      <label class="form-check-label fw-bold text-primary fs-6" for="eventTypeKata">
                        🎯 Kata (Form Performance)
                      </label>
                      <div class="small text-muted">5-referee score table & rankings</div>
                    </div>
                  </div>
                </div>

                <div class="row g-3 mb-3">
                  <!-- Age Category -->
                  <div class="col-md-6">
                    <label class="form-label fw-bold">Age Category <span class="text-danger">*</span></label>
                    <select id="createBoutAgeSelect" class="form-select" onchange="BoutEditor.onCreateAgeChange(); BoutEditor.autoGenerateBoutName();">
                      <option value="Under 8">Under 8 Years</option>
                      <option value="Under 10">Under 10 Years</option>
                      <option value="Under 12" selected>Under 12 Years</option>
                      <option value="12-14 Years">12-14 Years</option>
                      <option value="14-15 Years">14-15 Years (Cadet)</option>
                      <option value="16-17 Years">16-17 Years (Junior)</option>
                      <option value="Senior (18+)">Senior (18+)</option>
                      <option value="CUSTOM">-- Custom Age Category --</option>
                    </select>
                    <input type="text" id="createBoutCustomAge" class="form-control mt-2" placeholder="Enter Custom Age Category" style="display: none;" oninput="BoutEditor.autoGenerateBoutName()">
                  </div>

                  <!-- Gender -->
                  <div class="col-md-6">
                    <label class="form-label fw-bold">Gender <span class="text-danger">*</span></label>
                    <select id="createBoutGender" class="form-select" onchange="BoutEditor.autoGenerateBoutName()">
                      <option value="Male" selected>Male</option>
                      <option value="Female">Female</option>
                      <option value="Mixed">Mixed</option>
                    </select>
                  </div>
                </div>

                <div class="row g-3 mb-3">
                  <!-- Belt Tier -->
                  <div class="col-md-6">
                    <label class="form-label fw-bold">Belt Category / Level</label>
                    <select id="createBoutBelt" class="form-select" onchange="BoutEditor.autoGenerateBoutName()">
                      <option value="General" selected>General / All Belts</option>
                      <option value="White">White Belt</option>
                      <option value="Yellow - Orange">Yellow - Orange Belts</option>
                      <option value="Green - Blue">Green - Blue Belts</option>
                      <option value="Brown - Black">Brown - Black Belts</option>
                    </select>
                  </div>

                  <!-- Tatami Assignment -->
                  <div class="col-md-6">
                    <label class="form-label fw-bold">Assign to Tatami Ring (Optional)</label>
                    <select id="createBoutTatami" class="form-select">
                      <option value="">Unassigned (Assign Later)</option>
                      <option value="1">Tatami 1</option>
                      <option value="2">Tatami 2</option>
                      <option value="3">Tatami 3</option>
                      <option value="4">Tatami 4</option>
                      <option value="5">Tatami 5</option>
                      <option value="6">Tatami 6</option>
                      <option value="7">Tatami 7</option>
                      <option value="8">Tatami 8</option>
                    </select>
                  </div>
                </div>

                <!-- Bout Name / Title -->
                <div class="mb-3">
                  <label class="form-label fw-bold">Bout Sheet Title <span class="text-danger">*</span></label>
                  <input type="text" id="createBoutName" class="form-control fw-bold text-primary" placeholder="e.g. Under 12 Male Kumite Bout A" required>
                  <div class="form-text">Official title printed on bout sheets and displayed on scoreboards.</div>
                </div>

                <!-- Initial Competitors List (Optional) -->
                <div class="mb-3">
                  <label class="form-label fw-bold">Initial Competitors / Participants (Optional)</label>
                  <textarea id="createBoutParticipantsText" class="form-control font-monospace" rows="4" placeholder="Enter competitor names, one per line. Optional format: Name - Dojo or Name (Dojo)&#10;e.g.&#10;John Smith - Shotokan Central&#10;Maria Garcia (Eagle Dojo)&#10;Kenji Sato"></textarea>
                  <div class="form-text">Leave empty to create an empty bout template. Competitors can be added anytime later.</div>
                </div>

                <div class="modal-footer px-0 pb-0 pt-3 border-top">
                  <button type="button" class="btn btn-secondary fw-bold" data-bs-dismiss="modal">Cancel</button>
                  <button type="submit" class="btn btn-primary fw-bold px-4">⚡ Create Bout Sheet</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    const modal = new bootstrap.Modal(document.getElementById('createBoutModal'));
    modal.show();

    this.autoGenerateBoutName();
  },

  onCreateAgeChange() {
    const ageSelect = document.getElementById('createBoutAgeSelect');
    const customInput = document.getElementById('createBoutCustomAge');
    if (ageSelect && customInput) {
      if (ageSelect.value === 'CUSTOM') {
        customInput.style.display = 'block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
      }
    }
  },

  autoGenerateBoutName() {
    const nameInput = document.getElementById('createBoutName');
    if (!nameInput) return;

    const eventTypeEl = document.querySelector('input[name="createEventType"]:checked');
    const eventType = eventTypeEl ? eventTypeEl.value : 'Kumite';

    const ageSelect = document.getElementById('createBoutAgeSelect');
    const customAgeInput = document.getElementById('createBoutCustomAge');
    let age = 'Under 12';
    if (ageSelect) {
      if (ageSelect.value === 'CUSTOM') {
        age = (customAgeInput && customAgeInput.value.trim()) ? customAgeInput.value.trim() : 'Custom';
      } else {
        age = ageSelect.value;
      }
    }

    const gender = document.getElementById('createBoutGender') ? document.getElementById('createBoutGender').value : 'Male';
    const belt = document.getElementById('createBoutBelt') ? document.getElementById('createBoutBelt').value : 'General';

    const beltStr = (belt && belt !== 'General') ? ` (${belt})` : '';

    const existingBouts = SyncService.state.bouts || [];
    const matchingCount = existingBouts.filter(b => 
      (b.eventType || 'Kumite') === eventType && 
      (b.ageCategory || '').toLowerCase() === age.toLowerCase() &&
      (b.gender || '').toLowerCase() === gender.toLowerCase()
    ).length;

    const letterCode = String.fromCharCode(65 + (matchingCount % 26));

    const generatedTitle = `${age} ${gender}${beltStr} ${eventType} Bout ${letterCode}`;
    nameInput.value = generatedTitle;
  },

  parseCompetitorsText(text, defaultAge, defaultGender, defaultBelt) {
    if (!text || !text.trim()) return [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    return lines.map((line, idx) => {
      let name = line;
      let branch = 'General';

      if (line.includes(' - ')) {
        const parts = line.split(' - ');
        name = parts[0].trim();
        branch = parts.slice(1).join(' - ').trim();
      } else if (line.includes(' / ')) {
        const parts = line.split(' / ');
        name = parts[0].trim();
        branch = parts.slice(1).join(' / ').trim();
      } else {
        const match = line.match(/^(.+?)\s*\((.+?)\)$/);
        if (match) {
          name = match[1].trim();
          branch = match[2].trim();
        }
      }

      return {
        id: 'p_manual_' + Math.random().toString(36).substr(2, 7),
        name: this.cleanParticipantName(name),
        branch: branch || 'General',
        dojo: branch || 'General',
        age: defaultAge || 'General',
        gender: defaultGender || 'Mixed',
        beltLabel: defaultBelt || 'General',
        beltTier: defaultBelt || 'General'
      };
    });
  },

  confirmCreateBout() {
    if (!AuthService.currentUser || AuthService.currentUser.role !== 'organizer') {
      return alert('Access Denied: Only Tournament Organizer / Admin can create new bouts.');
    }

    const eventTypeEl = document.querySelector('input[name="createEventType"]:checked');
    const eventType = eventTypeEl ? eventTypeEl.value : 'Kumite';

    const ageSelect = document.getElementById('createBoutAgeSelect');
    const customAgeInput = document.getElementById('createBoutCustomAge');
    let ageCategory = 'Under 12';
    if (ageSelect) {
      if (ageSelect.value === 'CUSTOM') {
        ageCategory = (customAgeInput && customAgeInput.value.trim()) ? customAgeInput.value.trim() : 'Custom Category';
      } else {
        ageCategory = ageSelect.value;
      }
    }

    const gender = document.getElementById('createBoutGender').value;
    const beltTier = document.getElementById('createBoutBelt').value;
    const tatamiIdVal = document.getElementById('createBoutTatami').value;
    const boutName = document.getElementById('createBoutName').value.trim();
    const participantsText = document.getElementById('createBoutParticipantsText').value;

    if (!boutName) {
      return alert('Bout Sheet Title is required!');
    }

    const parsedParticipants = this.parseCompetitorsText(participantsText, ageCategory, gender, beltTier);
    const numericTatamiId = tatamiIdVal ? parseInt(tatamiIdVal, 10) : null;

    const cleanAgeCode = ageCategory.toLowerCase().replace(/[^a-z0-9]/g, '');
    const boutId = 'bout_' + eventType.toLowerCase() + '_' + Math.random().toString(36).substr(2, 9);
    const boutCode = `${cleanAgeCode}_${eventType.toLowerCase()}_${Date.now().toString(36)}`;

    const boutObj = {
      id: boutId,
      boutCode: boutCode,
      boutName: boutName,
      eventType: eventType,
      ageCategory: ageCategory,
      gender: gender,
      beltTier: beltTier,
      beltLabel: beltTier,
      participants: parsedParticipants,
      status: numericTatamiId ? 'Assigned' : 'Pending',
      tatamiId: numericTatamiId
    };

    const bracketObj = BracketEngine.createBracket(boutObj);
    if (numericTatamiId) {
      bracketObj.tatamiId = numericTatamiId;
    }

    SyncService.addNewBout(boutObj, bracketObj);

    const modalEl = document.getElementById('createBoutModal');
    if (modalEl) {
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();
    }

    loadBoutIntoEditor(boutId);
  }
};

window.BoutEditor = BoutEditor;
