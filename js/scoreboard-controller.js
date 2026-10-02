/**
 * Scoreboard Controller Integration
 * Handles live scoring, tracking Yuko, Waza-ari, Ippon, penalties, and committing results
 */

const ScoreboardController = {
  currentMatchContext: null,

  // Load a match into the live scoreboard
  loadMatch(boutId, matchNumber) {
    const bracket = SyncService.state.brackets[boutId];
    if (!bracket) return alert('Bout bracket not found!');

    const match = bracket.matches.find(m => m.matchNumber === matchNumber);
    if (!match) return alert('Match not found!');

    if (!match.aao && !match.aka) return alert('No participants in this match slot!');

    this.currentMatchContext = {
      boutId,
      matchNumber,
      boutCode: bracket.boutCode,
      boutName: bracket.boutName,
      match
    };

    // Pause background polling while Kumite match is live
    SyncService.startBoutScoring(boutId);

    // Populate Scoreboard Headers
    const redName = match.aka ? match.aka.name : 'BYE';
    const blueName = match.aao ? match.aao.name : 'BYE';
    document.getElementById('akaFighterName').innerText = redName;
    document.getElementById('aaoFighterName').innerText = blueName;
    const categoryTitleElem = document.getElementById('matchCategoryTitle');
    if (categoryTitleElem) {
      categoryTitleElem.innerText = `${bracket.boutName} - Match #${matchNumber} (${match.roundName})`;
    }

    // Reset scores & stats
    resetTimer();

    // Show Scoreboard Modal / Section
    document.getElementById('scoreboardSection').style.display = 'block';
    document.getElementById('mainNavTabs').style.display = 'none';
    document.getElementById('organizerView').style.display = 'none';
    document.getElementById('tatamiView').style.display = 'none';
    document.getElementById('boutEditorView').style.display = 'none';
  },

  // Close scoreboard and return smoothly to active view
  closeScoreboard() {
    SyncService.stopBoutScoring();
    document.getElementById('scoreboardSection').style.display = 'none';
    document.getElementById('mainNavTabs').style.display = 'flex';
    
    const user = AuthService.currentUser;

    if (user && user.role === 'tatami') {
      document.getElementById('tatamiView').style.display = 'block';
      document.getElementById('organizerView').style.display = 'none';
      document.getElementById('boutEditorView').style.display = 'none';
      TatamiManager.renderOperatorView(user.tatamiId, 'tatamiOperatorContainer');
    } else {
      // Default to Organizer / Bout Editor view
      document.getElementById('organizerView').style.display = 'block';
      document.getElementById('tatamiView').style.display = 'none';
      TatamiManager.renderOrganizerDashboard('tatamiDashboardContainer');

      if (this.currentMatchContext && this.currentMatchContext.boutId) {
        BoutEditor.renderBoutSheet(this.currentMatchContext.boutId, 'activeBoutDiagramContainer');
      }
    }
  },

  // Commit match result upon referee confirmation
  commitCurrentMatch(winnerSide, winReason) {
    if (!this.currentMatchContext) return;

    const { boutId, matchNumber } = this.currentMatchContext;

    // Calculate detailed stats from score histories
    const redYuko = redScoreHistory.filter(pts => pts === 1).length;
    const redWazaari = redScoreHistory.filter(pts => pts === 2).length;
    const redIppon = redScoreHistory.filter(pts => pts === 3).length;

    const blueYuko = blueScoreHistory.filter(pts => pts === 1).length;
    const blueWazaari = blueScoreHistory.filter(pts => pts === 2).length;
    const blueIppon = blueScoreHistory.filter(pts => pts === 3).length;

    const matchScore = {
      aaoPoints: blueScore,
      akaPoints: redScore,
      aaoYuko: blueYuko,
      akaYuko: redYuko,
      aaoWazaari: blueWazaari,
      akaWazaari: redWazaari,
      aaoIppon: blueIppon,
      akaIppon: redIppon,
      aaoPenalties: penalties.blue.cat1,
      akaPenalties: penalties.red.cat1,
      sensu: sensu,
      winReason: winReason || 'Referee Decision'
    };

    SyncService.commitMatchResult(boutId, matchNumber, winnerSide, matchScore);
    SyncService.pushToAivenDB();

    // Smooth transition back to view after winner banner display
    setTimeout(() => {
      this.closeScoreboard();
    }, 2500);
  }
};

window.ScoreboardController = ScoreboardController;
