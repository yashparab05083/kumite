/**
 * PDF Renderer Module for Shotokan Karate Championship
 * Render official bout sheets using the exact official background template image (bout_template.png)
 * strictly for downloadable 1-page A4 Landscape PDFs without changing the website UI.
 */

const PdfRenderer = {
  /**
   * Generates the 1024x657 template overlay HTML for a single bout
   */
  generateBoutTemplateHTML(bracket) {
    const m = bracket.matches;
    const slots = bracket.slots || [];

    // Helper to extract participant name or display BYE/empty
    const getName = (participant) => {
      if (!participant) return '';
      return participant.name || '';
    };

    const getWinnerName = (match) => {
      if (match && match.status === 'Completed' && match.winner) {
        return match.winner.name || '';
      }
      return '';
    };

    // Slot 1..16 participant names for Round 1
    const pSlots = [];
    for (let i = 0; i < 16; i++) {
      pSlots.push(getName(slots[i]));
    }

    // Match winners / participants for Quarter Finals (Matches 9, 10, 11, 12)
    const q9_aao = getName(m[8].aao);
    const q9_aka = getName(m[8].aka);
    const q10_aao = getName(m[9].aao);
    const q10_aka = getName(m[9].aka);

    const q11_aao = getName(m[10].aao);
    const q11_aka = getName(m[10].aka);
    const q12_aao = getName(m[11].aao);
    const q12_aka = getName(m[11].aka);

    // Semi Finals (Matches 13, 14)
    const s13_aao = getName(m[12].aao);
    const s13_aka = getName(m[12].aka);

    const s14_aao = getName(m[13].aao);
    const s14_aka = getName(m[13].aka);

    // Final (Match 15)
    const f15_aao = getName(m[14].aao);
    const f15_aka = getName(m[14].aka);

    // Medals
    const gold = bracket.medals && bracket.medals.gold ? bracket.medals.gold.name : '';
    const silver = bracket.medals && bracket.medals.silver ? bracket.medals.silver.name : '';
    const bronze1 = bracket.medals && bracket.medals.bronze1 ? bracket.medals.bronze1.name : '';
    const bronze2 = bracket.medals && bracket.medals.bronze2 ? bracket.medals.bronze2.name : '';

    return `
      <div class="pdf-bout-page" style="
        position: relative;
        width: 1024px;
        height: 657px;
        background-image: url('bout_template.png');
        background-size: 100% 100%;
        background-repeat: no-repeat;
        font-family: Arial, Helvetica, sans-serif;
        color: #000;
        box-sizing: border-box;
        page-break-after: always;
        page-break-inside: avoid;
        margin: 0 auto;
      ">
        <!-- HEADER OVERLAYS -->
        <!-- Age / Weight (Category Name) -->
        <div style="position: absolute; left: 215px; top: 66px; width: 175px; text-align: center; font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${bracket.boutName || ''}
        </div>

        <!-- Arena No -->
        <div style="position: absolute; left: 472px; top: 66px; width: 55px; text-align: center; font-weight: bold; font-size: 13px;">
          ${bracket.tatamiId ? 'Tatami ' + bracket.tatamiId : 'Ring 1'}
        </div>

        <!-- Belt Category -->
        <div style="position: absolute; left: 630px; top: 66px; width: 130px; text-align: center; font-weight: bold; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${bracket.beltTier || ''}
        </div>

        <!-- Gender -->
        <div style="position: absolute; left: 835px; top: 66px; width: 110px; font-weight: bold; font-size: 13px;">
          ${bracket.gender ? bracket.gender : 'Male / Female'}
        </div>

        <!-- R1 LEFT POOL (Slots 1..8) -->
        <div style="position: absolute; left: 65px; top: 119px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[0]}</div>
        <div style="position: absolute; left: 65px; top: 166px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[1]}</div>
        <div style="position: absolute; left: 65px; top: 220px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[2]}</div>
        <div style="position: absolute; left: 65px; top: 267px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[3]}</div>
        <div style="position: absolute; left: 65px; top: 331px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[4]}</div>
        <div style="position: absolute; left: 65px; top: 378px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[5]}</div>
        <div style="position: absolute; left: 65px; top: 442px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[6]}</div>
        <div style="position: absolute; left: 65px; top: 489px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[7]}</div>

        <!-- R1 RIGHT POOL (Slots 9..16) -->
        <div style="position: absolute; left: 855px; top: 119px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[8]}</div>
        <div style="position: absolute; left: 855px; top: 166px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[9]}</div>
        <div style="position: absolute; left: 855px; top: 220px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[10]}</div>
        <div style="position: absolute; left: 855px; top: 267px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[11]}</div>
        <div style="position: absolute; left: 855px; top: 331px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[12]}</div>
        <div style="position: absolute; left: 855px; top: 378px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[13]}</div>
        <div style="position: absolute; left: 855px; top: 442px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[14]}</div>
        <div style="position: absolute; left: 855px; top: 489px; width: 128px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${pSlots[15]}</div>

        <!-- R2 QUARTER FINALS (LEFT POOL) -->
        <div style="position: absolute; left: 235px; top: 142px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q9_aao}</div>
        <div style="position: absolute; left: 235px; top: 242px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q9_aka}</div>
        <div style="position: absolute; left: 235px; top: 354px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q10_aao}</div>
        <div style="position: absolute; left: 235px; top: 454px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q10_aka}</div>

        <!-- R2 QUARTER FINALS (RIGHT POOL) -->
        <div style="position: absolute; left: 693px; top: 142px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q11_aao}</div>
        <div style="position: absolute; left: 693px; top: 242px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q11_aka}</div>
        <div style="position: absolute; left: 693px; top: 354px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q12_aao}</div>
        <div style="position: absolute; left: 693px; top: 454px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q12_aka}</div>

        <!-- R3 SEMI FINALS (LEFT & RIGHT POOLS) -->
        <div style="position: absolute; left: 325px; top: 192px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s13_aao}</div>
        <div style="position: absolute; left: 325px; top: 403px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s13_aka}</div>
        <div style="position: absolute; left: 570px; top: 192px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s14_aao}</div>
        <div style="position: absolute; left: 570px; top: 403px; width: 120px; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s14_aka}</div>

        <!-- R4 FINAL CENTER CIRCLE -->
        <div style="position: absolute; left: 430px; top: 320px; width: 75px; text-align: center; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f15_aao}</div>
        <div style="position: absolute; left: 518px; top: 320px; width: 75px; text-align: center; font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${f15_aka}</div>

        <!-- FOOTER MEDALS -->
        <div style="position: absolute; left: 75px; top: 546px; width: 165px; font-weight: bold; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${gold}</div>
        <div style="position: absolute; left: 308px; top: 546px; width: 165px; font-weight: bold; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${silver}</div>
        <div style="position: absolute; left: 554px; top: 546px; width: 165px; font-weight: bold; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${bronze1}</div>
        <div style="position: absolute; left: 800px; top: 546px; width: 165px; font-weight: bold; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${bronze2}</div>
      </div>
    `;
  },

  /**
   * Downloads a single bout PDF using the background template format
   */
  downloadBoutPDF(boutId) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) {
      alert('No active bout sheet found!');
      return;
    }

    const container = document.createElement('div');
    container.id = 'pdfRenderContainer';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1024px';
    document.body.appendChild(container);

    container.innerHTML = this.generateBoutTemplateHTML(bracket);

    const filename = `${(bracket.boutCode || 'BOUT').toUpperCase()}_${(bracket.boutName || 'Sheet').replace(/[^a-zA-Z0-9]/g, '_')}_Official.pdf`;

    const opt = {
      margin:       0,
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, windowWidth: 1024 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape', compress: true }
    };

    html2pdf().set(opt).from(container).save().then(() => {
      if (document.getElementById('pdfRenderContainer')) {
        document.body.removeChild(container);
      }
    }).catch(err => {
      console.error('Single PDF Export Error:', err);
      if (document.getElementById('pdfRenderContainer')) {
        document.body.removeChild(container);
      }
    });
  },

  /**
   * Downloads all bout sheets merged into 1 PDF using the background template format
   */
  downloadAllBoutsPDF() {
    const bouts = SyncService.state.bouts;
    if (!bouts || bouts.length === 0) {
      alert('No bout sheets generated yet!');
      return;
    }

    const container = document.createElement('div');
    container.id = 'tempPdfBatchContainer';
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1024px';
    document.body.appendChild(container);

    let html = '';
    bouts.forEach(b => {
      const bracket = SyncService.state.brackets[b.id];
      if (bracket) {
        html += this.generateBoutTemplateHTML(bracket);
      }
    });

    container.innerHTML = html;

    const opt = {
      margin:       0,
      filename:     `Shotokan_Championship_All_Bout_Sheets.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, windowWidth: 1024 },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape', compress: true },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    html2pdf().set(opt).from(container).save().then(() => {
      if (document.getElementById('tempPdfBatchContainer')) {
        document.body.removeChild(container);
      }
    }).catch(err => {
      console.error('Batch PDF Export Error:', err);
      if (document.getElementById('tempPdfBatchContainer')) {
        document.body.removeChild(container);
      }
    });
  }
};
