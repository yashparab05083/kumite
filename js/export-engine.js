/**
 * Export Engine for Shotokan Karate Championship
 * Generates single consolidated Excel file with Medal Summary, Participant Stats & Match Logs
 */

const ExportEngine = {
  exportTournamentResults() {
    const bouts = SyncService.state.bouts;
    const brackets = SyncService.state.brackets;

    if (!bouts || bouts.length === 0) {
      return alert('No tournament data available to export!');
    }

    const wb = XLSX.utils.book_new();

    // 1. Sheet 1: Medal Summary
    const medalRows = [];
    bouts.forEach(b => {
      const br = brackets[b.id];
      if (br) {
        medalRows.push({
          'Bout Code': b.boutCode,
          'Category Name': b.boutName,
          'Age Category': b.ageCategory,
          'Gender': b.gender,
          'Belt Tier': b.beltTier,
          'Gold (1st)': br.medals.gold ? br.medals.gold.name : 'Pending',
          'Gold Dojo': br.medals.gold ? br.medals.gold.branch : '',
          'Silver (2nd)': br.medals.silver ? br.medals.silver.name : 'Pending',
          'Silver Dojo': br.medals.silver ? br.medals.silver.branch : '',
          'Bronze 1 (3rd)': br.medals.bronze1 ? br.medals.bronze1.name : 'Pending',
          'Bronze 1 Dojo': br.medals.bronze1 ? br.medals.bronze1.branch : '',
          'Bronze 2 (3rd)': br.medals.bronze2 ? br.medals.bronze2.name : 'Pending',
          'Bronze 2 Dojo': br.medals.bronze2 ? br.medals.bronze2.branch : ''
        });
      }
    });

    const medalSheet = XLSX.utils.json_to_sheet(medalRows);
    XLSX.utils.book_append_sheet(wb, medalSheet, 'Medal Summary');

    // 2. Sheet 2: Participant Performance Stats
    const statsMap = {};

    Object.values(brackets).forEach(br => {
      br.matches.forEach(m => {
        if (m.status === 'Completed' && m.score) {
          const processParticipantStats = (p, isAao) => {
            if (!p) return;
            if (!statsMap[p.id]) {
              statsMap[p.id] = {
                'Name': p.name,
                'Branch / Dojo': p.branch,
                'Age': p.age,
                'Gender': p.gender,
                'Belt': p.beltLabel,
                'Yuko (+1)': 0,
                'Waza-ari (+2)': 0,
                'Ippon (+3)': 0,
                'Total Points': 0,
                'Penalties': 0,
                'Matches Played': 0,
                'Matches Won': 0,
                'Medal': ''
              };
            }

            const st = statsMap[p.id];
            st['Matches Played'] += 1;
            if (m.winner && m.winner.id === p.id) st['Matches Won'] += 1;

            if (isAao) {
              st['Yuko (+1)'] += m.score.aaoYuko || 0;
              st['Waza-ari (+2)'] += m.score.aaoWazaari || 0;
              st['Ippon (+3)'] += m.score.aaoIppon || 0;
              st['Total Points'] += m.score.aaoPoints || 0;
              st['Penalties'] += m.score.aaoPenalties || 0;
            } else {
              st['Yuko (+1)'] += m.score.akaYuko || 0;
              st['Waza-ari (+2)'] += m.score.akaWazaari || 0;
              st['Ippon (+3)'] += m.score.akaIppon || 0;
              st['Total Points'] += m.score.akaPoints || 0;
              st['Penalties'] += m.score.akaPenalties || 0;
            }
          };

          processParticipantStats(m.aao, true);
          processParticipantStats(m.aka, false);
        }
      });

      // Attach Medals
      if (br.medals.gold && statsMap[br.medals.gold.id]) statsMap[br.medals.gold.id]['Medal'] = 'Gold';
      if (br.medals.silver && statsMap[br.medals.silver.id]) statsMap[br.medals.silver.id]['Medal'] = 'Silver';
      if (br.medals.bronze1 && statsMap[br.medals.bronze1.id]) statsMap[br.medals.bronze1.id]['Medal'] = 'Bronze';
      if (br.medals.bronze2 && statsMap[br.medals.bronze2.id]) statsMap[br.medals.bronze2.id]['Medal'] = 'Bronze';
    });

    const participantSheet = XLSX.utils.json_to_sheet(Object.values(statsMap));
    XLSX.utils.book_append_sheet(wb, participantSheet, 'Participant Stats');

    // 3. Sheet 3: Full Match Logs
    const matchLogs = [];
    Object.values(brackets).forEach(br => {
      br.matches.forEach(m => {
        if (m.status === 'Completed') {
          matchLogs.push({
            'Bout Code': br.boutCode,
            'Category': br.boutName,
            'Match #': m.matchNumber,
            'Round': m.roundName,
            'AAO Fighter': m.aao ? m.aao.name : 'BYE',
            'AAO Dojo': m.aao ? m.aao.branch : '',
            'AKA Fighter': m.aka ? m.aka.name : 'BYE',
            'AKA Dojo': m.aka ? m.aka.branch : '',
            'AAO Score': m.score.aaoPoints || 0,
            'AKA Score': m.score.akaPoints || 0,
            'Winner': m.winner ? m.winner.name : 'Draw',
            'Win Reason': m.score.winReason || ''
          });
        }
      });
    });

    const logsSheet = XLSX.utils.json_to_sheet(matchLogs);
    XLSX.utils.book_append_sheet(wb, logsSheet, 'Match Logs');

    // Download File
    const filename = `Tournament_Results_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  }
};

window.ExportEngine = ExportEngine;
