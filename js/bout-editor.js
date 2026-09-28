/**
 * 16-Slot Interactive Bout Sheet Editor & Official Reference Template Renderer
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

  // Helper to render SVG connector line paths for PDF bracket tree
  renderConnectorSVG(type, isRightSide) {
    const w = 42;
    const h = 500;
    const midW = w / 2;
    const xStart = isRightSide ? w : 0;
    const xMid = isRightSide ? w - midW : midW;
    const xEnd = isRightSide ? 0 : w;

    if (type === 'r1_to_r2') {
      return `
        <svg class="pdf-connector-col" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
          <path d="M ${xStart},20 L ${xMid},20 L ${xMid},54 L ${xStart},54 M ${xMid},37 L ${xEnd},37" stroke="#000" stroke-width="1.5" fill="none"/>
          <path d="M ${xStart},146 L ${xMid},146 L ${xMid},180 L ${xStart},180 M ${xMid},163 L ${xEnd},163" stroke="#000" stroke-width="1.5" fill="none"/>
          <path d="M ${xStart},272 L ${xMid},272 L ${xMid},306 L ${xStart},306 M ${xMid},289 L ${xEnd},289" stroke="#000" stroke-width="1.5" fill="none"/>
          <path d="M ${xStart},398 L ${xMid},398 L ${xMid},432 L ${xStart},432 M ${xMid},415 L ${xEnd},415" stroke="#000" stroke-width="1.5" fill="none"/>
        </svg>
      `;
    } else if (type === 'r2_to_r3') {
      return `
        <svg class="pdf-connector-col" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
          <path d="M ${xStart},37 L ${xMid},37 L ${xMid},163 L ${xStart},163 M ${xMid},100 L ${xEnd},100" stroke="#000" stroke-width="1.5" fill="none"/>
          <path d="M ${xStart},289 L ${xMid},289 L ${xMid},415 L ${xStart},415 M ${xMid},352 L ${xEnd},352" stroke="#000" stroke-width="1.5" fill="none"/>
        </svg>
      `;
    } else if (type === 'r3_to_center') {
      return `
        <svg class="pdf-connector-col" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
          <path d="M ${xStart},100 L ${xEnd},180 M ${xStart},352 L ${xEnd},270" stroke="#000" stroke-width="1.5" fill="none"/>
        </svg>
      `;
    }
  },

  // Generate clean reference bout sheet HTML matching scoresheet-kumite.pdf
  generateBoutSheetHTML(bracket, isInteractive) {
    const m = bracket.matches;
    const isOrganizer = AuthService.currentUser && AuthService.currentUser.role === 'organizer';

    const renderBox = (participant, label, isWinner, slotIndex) => {
      const nameText = participant ? participant.name : (label ? '' : 'BYE');
      const winnerClass = isWinner ? 'winner-highlight' : '';

      return `
        <div class="pdf-fighter-box ${winnerClass}" ${isInteractive ? `onclick="BoutEditor.onMatchClick('${bracket.boutId}', ${Math.floor((slotIndex||0)/2)+1})"` : ''}>
          <span class="box-corner-label">${label}</span>
          <div class="box-name">${nameText}</div>
          ${(isInteractive && isOrganizer && this.isEditMode && slotIndex !== undefined) ? `
            <button class="btn btn-xs btn-light py-0 px-1 border fs-7 print-hide pdf-hide position-absolute end-0 top-0 m-1" onclick="event.stopPropagation(); BoutEditor.openSlotModal('${bracket.boutId}', ${slotIndex})">⚙️</button>
          ` : ''}
        </div>
      `;
    };

    // Extract finalist names for center circle (Match 15: m[14])
    const finalMatch = m[14];
    const finalAaoName = finalMatch && finalMatch.aao ? finalMatch.aao.name : '';
    const finalAkaName = finalMatch && finalMatch.aka ? finalMatch.aka.name : '';

    const goldName = bracket.medals && bracket.medals.gold ? bracket.medals.gold.name : '________________________';
    const silverName = bracket.medals && bracket.medals.silver ? bracket.medals.silver.name : '________________________';
    const bronze1Name = bracket.medals && bracket.medals.bronze1 ? bracket.medals.bronze1.name : '________________________';
    const bronze2Name = bracket.medals && bracket.medals.bronze2 ? bracket.medals.bronze2.name : '________________________';

    return `
      <div class="scoresheet-pdf-page shadow-sm">
        <!-- Official Header matching scoresheet-kumite.pdf -->
        <div class="scoresheet-pdf-header">
          <h1 class="scoresheet-pdf-title">SHOTOKAN KARATE CHAMPIONSHIP</h1>
          <div class="scoresheet-pdf-meta">
            <div class="scoresheet-pdf-meta-item">
              <span class="meta-label">Age/Weight:</span>
              <span class="meta-val">${bracket.boutName || '______________'}</span>
            </div>
            <div class="scoresheet-pdf-meta-item">
              <span class="meta-label">Arena No:</span>
              <span class="meta-val">${bracket.tatamiId ? 'Tatami ' + bracket.tatamiId : '______'}</span>
            </div>
            <div class="scoresheet-pdf-meta-item">
              <span class="meta-label">Belt Category:</span>
              <span class="meta-val">${bracket.beltTier || '______________'}</span>
            </div>
            <div class="scoresheet-pdf-meta-item">
              <span class="meta-label">Gender:</span>
              <span class="meta-val">${bracket.gender || 'Male / Female'}</span>
            </div>
          </div>
        </div>

        <!-- 16-Slot Infinity Seeding Bracket Diagram -->
        <div class="scoresheet-pdf-bracket-area">
          <!-- LEFT POOL (Pool A) -->
          <div class="scoresheet-pdf-pool left-pool">
            <!-- R1 (Matches 1..4, Slots 0..7) -->
            <div class="pdf-round-col r1">
              <div class="pdf-match-pair">
                ${renderBox(m[0].aao, 'AAO', m[0].winner && m[0].aao && m[0].winner.id === m[0].aao.id, 0)}
                ${renderBox(m[0].aka, 'AKA', m[0].winner && m[0].aka && m[0].winner.id === m[0].aka.id, 1)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[1].aao, 'AAO', m[1].winner && m[1].aao && m[1].winner.id === m[1].aao.id, 2)}
                ${renderBox(m[1].aka, 'AKA', m[1].winner && m[1].aka && m[1].winner.id === m[1].aka.id, 3)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[2].aao, 'AAO', m[2].winner && m[2].aao && m[2].winner.id === m[2].aao.id, 4)}
                ${renderBox(m[2].aka, 'AKA', m[2].winner && m[2].aka && m[2].winner.id === m[2].aka.id, 5)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[3].aao, 'AAO', m[3].winner && m[3].aao && m[3].winner.id === m[3].aao.id, 6)}
                ${renderBox(m[3].aka, 'AKA', m[3].winner && m[3].aka && m[3].winner.id === m[3].aka.id, 7)}
              </div>
            </div>

            ${this.renderConnectorSVG('r1_to_r2', false)}

            <!-- R2 Quarter-Finals (Matches 9, 10) -->
            <div class="pdf-round-col r2">
              <div class="pdf-match-pair">
                ${renderBox(m[8].aao, 'AAO', m[8].winner && m[8].aao && m[8].winner.id === m[8].aao.id)}
                ${renderBox(m[8].aka, 'AKA', m[8].winner && m[8].aka && m[8].winner.id === m[8].aka.id)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[9].aao, 'AAO', m[9].winner && m[9].aao && m[9].winner.id === m[9].aao.id)}
                ${renderBox(m[9].aka, 'AKA', m[9].winner && m[9].aka && m[9].winner.id === m[9].aka.id)}
              </div>
            </div>

            ${this.renderConnectorSVG('r2_to_r3', false)}

            <!-- R3 Semi-Final (Match 13) -->
            <div class="pdf-round-col r3">
              <div class="pdf-match-pair">
                ${renderBox(m[12].aao, 'AAO', m[12].winner && m[12].aao && m[12].winner.id === m[12].aao.id)}
                ${renderBox(m[12].aka, 'AKA', m[12].winner && m[12].aka && m[12].winner.id === m[12].aka.id)}
              </div>
            </div>

            ${this.renderConnectorSVG('r3_to_center', false)}
          </div>

          <!-- CENTER CIRCLE (FINAL MATCH 15) -->
          <div class="scoresheet-pdf-center-circle">
            <svg class="center-circle-divider" viewBox="0 0 200 200">
              <line x1="120" y1="0" x2="80" y2="200" stroke="#000" stroke-width="2"/>
            </svg>
            <div class="circle-half aao">
              <span class="circle-label">AAO</span>
              <div class="circle-name">${finalAaoName}</div>
            </div>
            <div class="circle-half aka">
              <span class="circle-label">AKA</span>
              <div class="circle-name">${finalAkaName}</div>
            </div>
          </div>

          <!-- RIGHT POOL (Pool B) -->
          <div class="scoresheet-pdf-pool right-pool">
            <!-- R1 (Matches 5..8, Slots 8..15) -->
            <div class="pdf-round-col r1">
              <div class="pdf-match-pair">
                ${renderBox(m[4].aao, 'AAO', m[4].winner && m[4].aao && m[4].winner.id === m[4].aao.id, 8)}
                ${renderBox(m[4].aka, 'AKA', m[4].winner && m[4].aka && m[4].winner.id === m[4].aka.id, 9)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[5].aao, 'AAO', m[5].winner && m[5].aao && m[5].winner.id === m[5].aao.id, 10)}
                ${renderBox(m[5].aka, 'AKA', m[5].winner && m[5].aka && m[5].winner.id === m[5].aka.id, 11)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[6].aao, 'AAO', m[6].winner && m[6].aao && m[6].winner.id === m[6].aao.id, 12)}
                ${renderBox(m[6].aka, 'AKA', m[6].winner && m[6].aka && m[6].winner.id === m[6].aka.id, 13)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[7].aao, 'AAO', m[7].winner && m[7].aao && m[7].winner.id === m[7].aao.id, 14)}
                ${renderBox(m[7].aka, 'AKA', m[7].winner && m[7].aka && m[7].winner.id === m[7].aka.id, 15)}
              </div>
            </div>

            ${this.renderConnectorSVG('r1_to_r2', true)}

            <!-- R2 Quarter-Finals (Matches 11, 12) -->
            <div class="pdf-round-col r2">
              <div class="pdf-match-pair">
                ${renderBox(m[10].aao, 'AAO', m[10].winner && m[10].aao && m[10].winner.id === m[10].aao.id)}
                ${renderBox(m[10].aka, 'AKA', m[10].winner && m[10].aka && m[10].winner.id === m[10].aka.id)}
              </div>
              <div class="pdf-match-pair">
                ${renderBox(m[11].aao, 'AAO', m[11].winner && m[11].aao && m[11].winner.id === m[11].aao.id)}
                ${renderBox(m[11].aka, 'AKA', m[11].winner && m[11].aka && m[11].winner.id === m[11].aka.id)}
              </div>
            </div>

            ${this.renderConnectorSVG('r2_to_r3', true)}

            <!-- R3 Semi-Final (Match 14) -->
            <div class="pdf-round-col r3">
              <div class="pdf-match-pair">
                ${renderBox(m[13].aao, 'AAO', m[13].winner && m[13].aao && m[13].winner.id === m[13].aao.id)}
                ${renderBox(m[13].aka, 'AKA', m[13].winner && m[13].aka && m[13].winner.id === m[13].aka.id)}
              </div>
            </div>

            ${this.renderConnectorSVG('r3_to_center', true)}
          </div>
        </div>

        <!-- Official Medals & Referee Footer matching scoresheet-kumite.pdf -->
        <div class="scoresheet-pdf-footer">
          <div class="scoresheet-pdf-medals">
            <div class="medal-item">GOLD-1: <span>${goldName}</span></div>
            <div class="medal-item">SILVER-2: <span>${silverName}</span></div>
            <div class="medal-item">BRONZE -3: <span>${bronze1Name}</span></div>
            <div class="medal-item">BRONZE -3: <span>${bronze2Name}</span></div>
          </div>
          <div class="scoresheet-pdf-referees">
            <span>REFREE’S NAME / SIGNATURE:</span>
            <div class="ref-item">1. <span></span></div>
            <div class="ref-item">2. <span></span></div>
            <div class="ref-item">3. <span></span></div>
            <div class="ref-item">4. <span></span></div>
            <div class="ref-item">5. <span></span></div>
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
      <div class="d-flex justify-content-between align-items-center mb-3 bg-light p-2 rounded border print-hide pdf-hide">
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

      ${this.generateBoutSheetHTML(bracket, true)}
    `;

    container.innerHTML = html;
  },

  // Export Single Active Bout Sheet as 1-Page Landscape PDF matching reference template
  downloadBoutPDF(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    const tempContainer = document.createElement('div');
    tempContainer.id = 'singlePdfTempContainer';
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '297mm';
    tempContainer.style.height = '209mm';
    tempContainer.style.background = '#ffffff';
    document.body.appendChild(tempContainer);

    tempContainer.innerHTML = this.generateBoutSheetHTML(bracket, false);

    const filename = `${bracket.boutCode.toUpperCase()}_${bracket.boutName.replace(/[^a-zA-Z0-9]/g, '_')}_Sheet.pdf`;

    const opt = {
      margin:       0,
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, width: 1123, windowWidth: 1123 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true }
    };

    html2pdf().set(opt).from(tempContainer).save().then(() => {
      if (document.getElementById('singlePdfTempContainer')) {
        document.body.removeChild(tempContainer);
      }
    }).catch(err => {
      console.error('PDF export error:', err);
      if (document.getElementById('singlePdfTempContainer')) {
        document.body.removeChild(tempContainer);
      }
    });
  },

  // Merge ALL Tournament Bout Sheets into 1 PDF (1 Bout Sheet per Landscape Page)
  downloadAllBoutsPDF() {
    const bouts = SyncService.state.bouts;
    if (!bouts || bouts.length === 0) return alert('No bout sheets generated yet!');

    const container = document.createElement('div');
    container.id = 'tempPdfBatchContainer';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '297mm';
    container.style.background = '#ffffff';
    document.body.appendChild(container);

    let html = '';
    bouts.forEach((b) => {
      const bracket = SyncService.state.brackets[b.id];
      if (bracket) {
        html += this.generateBoutSheetHTML(bracket, false);
      }
    });

    container.innerHTML = html;

    const opt = {
      margin:       0,
      filename:     `Shotokan_Championship_All_Bout_Sheets.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, width: 1123, windowWidth: 1123 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    html2pdf().set(opt).from(container).save().then(() => {
      if (document.getElementById('tempPdfBatchContainer')) {
        document.body.removeChild(container);
      }
    }).catch(err => {
      console.error('Batch PDF export error:', err);
      if (document.getElementById('tempPdfBatchContainer')) {
        document.body.removeChild(container);
      }
    });
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
