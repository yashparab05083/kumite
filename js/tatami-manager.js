/**
 * Tatami (Ring) Manager & Queue Controller
 * Manages 8 Tatami rings, bout assignments, and operator queues
 */

const TatamiManager = {
  renderOrganizerDashboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tatamis = SyncService.state.tatamis || [];
    const bouts = SyncService.state.bouts || [];

    let html = `
      <div class="row g-3">
    `;

    tatamis.forEach(tatami => {
      const activeBout = bouts.find(b => b.id === tatami.activeBoutId);
      const assignedIds = Array.isArray(tatami.assignedBoutIds) ? tatami.assignedBoutIds : [];
      const assignedBouts = bouts.filter(b => (assignedIds && assignedIds.indexOf(b.id) !== -1) || b.tatamiId === tatami.id);

      html += `
        <div class="col-md-3">
          <div class="card h-100 shadow-sm border-2 ${tatami.status === 'Active' ? 'border-success' : 'border-secondary'}">
            <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
              <h5 class="m-0 fw-bold">🥋 ${tatami.name}</h5>
              <span class="badge ${tatami.status === 'Active' ? 'bg-success' : 'bg-secondary'}">${tatami.status}</span>
            </div>
            <div class="card-body">
              <p class="mb-1 text-muted">Active Bout:</p>
              <h6 class="fw-bold text-primary">${activeBout ? activeBout.boutName : 'None (Empty)'}</h6>
              
              <hr class="my-2">
              <p class="mb-1 text-muted">Assigned Queue (${assignedBouts.length}):</p>
              <ul class="list-group list-group-flush small mb-3">
                ${assignedBouts.map(b => `
                  <li class="list-group-item d-flex justify-content-between align-items-center p-1 fs-7">
                    <span>${b.boutName}</span>
                    <span class="badge ${b.status === 'Completed' ? 'bg-secondary' : 'bg-info'}">${b.status}</span>
                  </li>
                `).join('') || '<li class="list-group-item text-muted p-1">No bouts assigned</li>'}
              </ul>
            </div>
            <div class="card-footer bg-light">
              <button class="btn btn-sm btn-outline-primary w-100" onclick="TatamiManager.openAssignModal(${tatami.id})">+ Assign Bout Sheet</button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  },

  renderOperatorView(tatamiId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const numericTatamiId = parseInt(tatamiId, 10);
    const tatami = SyncService.state.tatamis.find(t => t.id === numericTatamiId);
    if (!tatami) return;

    const assignedIds = Array.isArray(tatami.assignedBoutIds) ? tatami.assignedBoutIds : [];
    const assignedBouts = SyncService.state.bouts.filter(b => (assignedIds && assignedIds.indexOf(b.id) !== -1) || b.tatamiId === numericTatamiId);
    const activeBout = SyncService.state.bouts.find(b => b.id === tatami.activeBoutId);

    let html = `
      <div class="card shadow mb-4">
        <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
          <h3 class="m-0 fw-bold">🥋 ${tatami.name} - Scoreboard Operator Ring</h3>
          <span class="badge bg-light text-dark fs-6">${assignedBouts.length} Bouts Assigned</span>
        </div>
        <div class="card-body">
          <h4 class="fw-bold mb-3">Active Assigned Queue</h4>
          <div class="row g-3">
            ${assignedBouts.map(b => {
              const bracket = SyncService.state.brackets[b.id];
              const pendingMatches = bracket ? bracket.matches.filter(m => m.status === 'Scheduled').length : 0;
              return `
                <div class="col-md-4">
                  <div class="card border-primary h-100">
                    <div class="card-body">
                      <h5 class="card-title fw-bold">${b.boutName}</h5>
                      <p class="card-text text-muted mb-2">Category: ${b.ageCategory} | ${b.gender} | ${b.beltTier}</p>
                      <p class="card-text mb-2"><span class="badge bg-warning text-dark">${pendingMatches} Matches Ready</span></p>
                      <button class="btn btn-success w-100 fw-bold" onclick="TatamiManager.loadBoutForRing(${tatami.id}, '${b.id}')">Open Bout Bracket</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('') || '<div class="alert alert-info">No bout sheets assigned to this Tatami ring yet. Contact Organizer.</div>'}
          </div>
        </div>
      </div>

      <div id="ringBoutContainer"></div>
    `;

    container.innerHTML = html;

    if (activeBout) {
      BoutEditor.renderBoutSheet(activeBout.id, 'ringBoutContainer');
    }
  },

  openAssignModal(tatamiId) {
    const numericTatamiId = parseInt(tatamiId, 10);
    const bouts = SyncService.state.bouts || [];
    if (bouts.length === 0) return alert('No bout sheets created yet! Please upload an Excel file first.');

    const unassigned = bouts.filter(b => !b.tatamiId);
    const assignedOthers = bouts.filter(b => b.tatamiId && b.tatamiId !== numericTatamiId);
    const assignedHere = bouts.filter(b => b.tatamiId === numericTatamiId);

    const modalHtml = `
      <div class="modal fade" id="assignBoutModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header bg-dark text-white">
              <h5 class="modal-title">🥋 Assign Bout Sheet to Tatami ${numericTatamiId}</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <h6 class="fw-bold text-primary mb-2">Unassigned Bout Sheets (${unassigned.length}):</h6>
              ${unassigned.length > 0 ? `
                <div class="list-group mb-4">
                  ${unassigned.map(b => `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <h6 class="mb-0 fw-bold">${b.boutName}</h6>
                        <small class="text-muted">${b.eventType} | ${b.ageCategory} | ${b.participants ? b.participants.length : 0} competitors</small>
                      </div>
                      <button class="btn btn-sm btn-success fw-bold" onclick="TatamiManager.directAssign(${numericTatamiId}, '${b.id}')">➕ Assign to Tatami ${numericTatamiId}</button>
                    </div>
                  `).join('')}
                </div>
              ` : '<div class="alert alert-info py-2 small mb-4">All bout sheets are currently assigned. You can re-assign or move bouts below.</div>'}

              ${assignedOthers.length > 0 ? `
                <h6 class="fw-bold text-secondary mb-2">Bouts Assigned to Other Tatamis (${assignedOthers.length}):</h6>
                <div class="list-group mb-4">
                  ${assignedOthers.map(b => `
                    <div class="list-group-item d-flex justify-content-between align-items-center bg-light">
                      <div>
                        <h6 class="mb-0 fw-bold">${b.boutName}</h6>
                        <small class="text-muted">Currently on Tatami ${b.tatamiId}</small>
                      </div>
                      <button class="btn btn-sm btn-outline-warning fw-bold" onclick="TatamiManager.directAssign(${numericTatamiId}, '${b.id}')">🔁 Move to Tatami ${numericTatamiId}</button>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              ${assignedHere.length > 0 ? `
                <h6 class="fw-bold text-success mb-2">Currently Assigned to Tatami ${numericTatamiId} (${assignedHere.length}):</h6>
                <div class="list-group">
                  ${assignedHere.map(b => `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <h6 class="mb-0 fw-bold text-success">${b.boutName}</h6>
                        <small class="text-muted">Status: ${b.status}</small>
                      </div>
                      <button class="btn btn-sm btn-outline-danger" onclick="TatamiManager.directUnassign('${b.id}', ${numericTatamiId})">❌ Remove from Tatami</button>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    const modal = new bootstrap.Modal(document.getElementById('assignBoutModal'));
    modal.show();
  },

  directAssign(tatamiId, boutId) {
    const numericTatamiId = parseInt(tatamiId, 10);
    const bout = SyncService.state.bouts.find(b => b.id === boutId);
    const boutName = bout ? bout.boutName : 'Bout Sheet';

    SyncService.assignBoutToTatami(numericTatamiId, boutId);

    const modalEl = document.getElementById('assignBoutModal');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
      if (modal) { try { modal.hide(); } catch(e) {} }
    }
    setTimeout(() => {
      document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');
    }, 150);

    this.renderOrganizerDashboard('tatamiDashboardContainer');
    this.renderOperatorView(numericTatamiId, 'tatamiOperatorContainer');
    if (typeof renderBoutList === 'function') {
      renderBoutList('boutSheetsListContainer');
    }

    const statusEl = document.getElementById('importStatus');
    if (statusEl) {
      statusEl.className = 'fw-bold text-success';
      statusEl.innerText = `✅ Assigned "${boutName}" to Tatami ${numericTatamiId} successfully!`;
    }
  },

  directUnassign(boutId, tatamiId) {
    const numericTatamiId = parseInt(tatamiId, 10);
    SyncService.unassignBoutFromTatami(boutId);

    const modalEl = document.getElementById('assignBoutModal');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
      if (modal) { try { modal.hide(); } catch(e) {} }
    }
    setTimeout(() => {
      document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');
    }, 150);

    this.renderOrganizerDashboard('tatamiDashboardContainer');
    this.renderOperatorView(numericTatamiId, 'tatamiOperatorContainer');
    if (typeof renderBoutList === 'function') {
      renderBoutList('boutSheetsListContainer');
    }
  },

  confirmAssign(tatamiId) {
    this.openAssignModal(tatamiId);
  },

  loadBoutForRing(tatamiId, boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return;

    const firstScheduled = bracket.matches.find(m => m.status === 'Scheduled');
    const activeMatchNum = firstScheduled ? firstScheduled.matchNumber : 1;

    SyncService.setActiveTatamiMatch(tatamiId, boutId, activeMatchNum);
    BoutEditor.renderBoutSheet(boutId, 'ringBoutContainer');
  }
};

window.TatamiManager = TatamiManager;
