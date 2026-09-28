/**
 * 16-Slot Infinity Bracket Engine & Tournament Progression System
 * Shotokan Karate Championship (WKF Rules)
 */

const BracketEngine = {
  INFINITY_SEED_MAP: [
    0,   // Seed 1 -> L1 (AAO)
    15,  // Seed 2 -> R8 (AKA)
    8,   // Seed 3 -> R1 (AAO)
    7,   // Seed 4 -> L8 (AKA)
    2,   // Seed 5 -> L3 (AAO)
    13,  // Seed 6 -> R6 (AKA)
    11,  // Seed 7 -> R4 (AKA)
    4,   // Seed 8 -> L5 (AAO)
    1,   // Seed 9 -> L2 (AKA)
    14,  // Seed 10 -> R7 (AAO)
    9,   // Seed 11 -> R2 (AKA)
    6,   // Seed 12 -> L7 (AAO)
    3,   // Seed 13 -> L4 (AKA)
    12,  // Seed 14 -> R5 (AAO)
    10,  // Seed 15 -> R3 (AAO)
    5    // Seed 16 -> L6 (AKA)
  ],

  createBracket(bout) {
    const rawParticipants = [...bout.participants];
    const seededList = this.applyBranchSeparation(rawParticipants);
    const slots = Array(16).fill(null);

    seededList.forEach((participant, idx) => {
      if (idx < 16) {
        const slotIdx = this.INFINITY_SEED_MAP[idx];
        slots[slotIdx] = { ...participant, seedNumber: idx + 1 };
      }
    });

    const matches = [];

    // Round 1 (Matches 1..8)
    for (let i = 0; i < 8; i++) {
      const aao = slots[i * 2];
      const aka = slots[i * 2 + 1];
      const hasParticipants = aao || aka;

      matches.push({
        matchId: `m_${i + 1}`,
        matchNumber: i + 1,
        round: 1,
        roundName: 'Round 1',
        pool: i < 4 ? 'Left' : 'Right',
        aao,
        aka,
        winner: null,
        loser: null,
        status: hasParticipants ? 'Scheduled' : 'Empty',
        score: { aaoPoints: 0, akaPoints: 0, aaoYuko: 0, akaYuko: 0, aaoWazaari: 0, akaWazaari: 0, aaoIppon: 0, akaIppon: 0, aaoPenalties: 0, akaPenalties: 0, winReason: '' }
      });
    }

    // Round 2 (Quarter-Finals: Matches 9..12)
    for (let i = 0; i < 4; i++) {
      matches.push({
        matchId: `m_${i + 9}`,
        matchNumber: i + 9,
        round: 2,
        roundName: 'Quarter-Final',
        pool: i < 2 ? 'Left' : 'Right',
        aao: null,
        aka: null,
        winner: null,
        loser: null,
        status: 'Pending',
        score: { aaoPoints: 0, akaPoints: 0, aaoYuko: 0, akaYuko: 0, aaoWazaari: 0, akaWazaari: 0, aaoIppon: 0, akaIppon: 0, aaoPenalties: 0, akaPenalties: 0, winReason: '' }
      });
    }

    // Round 3 (Semi-Finals: Matches 13, 14)
    for (let i = 0; i < 2; i++) {
      matches.push({
        matchId: `m_${i + 13}`,
        matchNumber: i + 13,
        round: 3,
        roundName: 'Semi-Final',
        pool: i === 0 ? 'Left' : 'Right',
        aao: null,
        aka: null,
        winner: null,
        loser: null,
        status: 'Pending',
        score: { aaoPoints: 0, akaPoints: 0, aaoYuko: 0, akaYuko: 0, aaoWazaari: 0, akaWazaari: 0, aaoIppon: 0, akaIppon: 0, aaoPenalties: 0, akaPenalties: 0, winReason: '' }
      });
    }

    // Round 4 (Final: Match 15)
    matches.push({
      matchId: 'm_15',
      matchNumber: 15,
      round: 4,
      roundName: 'FINAL',
      pool: 'Center',
      aao: null,
      aka: null,
      winner: null,
      loser: null,
      status: 'Pending',
      score: { aaoPoints: 0, akaPoints: 0, aaoYuko: 0, akaYuko: 0, aaoWazaari: 0, akaWazaari: 0, aaoIppon: 0, akaIppon: 0, aaoPenalties: 0, akaPenalties: 0, winReason: '' }
    });

    return {
      boutId: bout.id,
      boutCode: bout.boutCode,
      boutName: bout.boutName,
      ageCategory: bout.ageCategory,
      gender: bout.gender,
      beltTier: bout.beltTier,
      slots,
      matches,
      medals: { gold: null, silver: null, bronze1: null, bronze2: null }
    };
  },

  applyBranchSeparation(participants) {
    const branchGroups = {};
    participants.forEach(p => {
      const b = p.branch || 'Unknown';
      if (!branchGroups[b]) branchGroups[b] = [];
      branchGroups[b].push(p);
    });

    const poolA = [];
    const poolB = [];

    Object.keys(branchGroups).forEach(branch => {
      const list = branchGroups[branch];
      list.forEach((p, idx) => {
        if (idx % 2 === 0) poolA.push(p);
        else poolB.push(p);
      });
    });

    return [...poolA, ...poolB];
  },

  // Check if a BYE match is allowed to advance (MUST NOT be waiting for a feeder match)
  canAdvanceBye(bracket, matchNumber) {
    const m = bracket.matches;
    const match = m[matchNumber - 1];
    if (!match || match.status === 'Completed') return false;

    // Round 1 matches can advance BYE directly if scheduled
    if (matchNumber <= 8) {
      return match.status === 'Scheduled';
    }

    // Feeder mapping for Rounds 2..4
    const feederMap = {
      9:  { aao: 0, aka: 1 },
      10: { aao: 2, aka: 3 },
      11: { aao: 4, aka: 5 },
      12: { aao: 6, aka: 7 },
      13: { aao: 8, aka: 9 },
      14: { aao: 10, aka: 11 },
      15: { aao: 12, aka: 13 }
    };

    const feeders = feederMap[matchNumber];
    if (!feeders) return false;

    const aaoFeeder = m[feeders.aao];
    const akaFeeder = m[feeders.aka];

    // Both upstream feeder matches MUST be completed first!
    if (aaoFeeder.status !== 'Completed' || akaFeeder.status !== 'Completed') {
      return false;
    }

    return true;
  },

  // Advance a BYE match manually upon operator confirmation
  advanceByeMatch(bracket, matchNumber) {
    if (!this.canAdvanceBye(bracket, matchNumber)) {
      alert('Cannot advance BYE yet! Preceding feeder matches must be completed first.');
      return bracket;
    }

    const match = bracket.matches[matchNumber - 1];

    if (match.aao && !match.aka) {
      match.winner = { ...match.aao };
      match.status = 'Completed';
      match.score.winReason = 'BYE (No Opponent)';
    } else if (!match.aao && match.aka) {
      match.winner = { ...match.aka };
      match.status = 'Completed';
      match.score.winReason = 'BYE (No Opponent)';
    } else if (!match.aao && !match.aka) {
      match.status = 'Completed';
      match.score.winReason = 'Both Slots Empty';
    }

    this.propagateWinners(bracket);
    this.calculateMedals(bracket);
    return bracket;
  },

  // Undo a completed match and reset downstream propagation
  undoMatch(bracket, matchNumber) {
    const match = bracket.matches[matchNumber - 1];
    if (!match || match.status !== 'Completed') return bracket;

    match.winner = null;
    match.loser = null;
    match.status = (match.aao || match.aka) ? 'Scheduled' : 'Pending';
    match.score = { aaoPoints: 0, akaPoints: 0, aaoYuko: 0, akaYuko: 0, aaoWazaari: 0, akaWazaari: 0, aaoIppon: 0, akaIppon: 0, aaoPenalties: 0, akaPenalties: 0, winReason: '' };

    this.rebuildDownstream(bracket);
    this.calculateMedals(bracket);
    return bracket;
  },

  // Update match result
  updateMatchResult(bracket, matchNumber, winnerSide, matchScore) {
    const matchIndex = matchNumber - 1;
    const targetMatch = bracket.matches[matchIndex];
    if (!targetMatch) return bracket;

    const winner = winnerSide === 'aao' ? targetMatch.aao : targetMatch.aka;
    const loser = winnerSide === 'aao' ? targetMatch.aka : targetMatch.aao;

    targetMatch.winner = winner;
    targetMatch.loser = loser;
    targetMatch.status = 'Completed';
    targetMatch.score = { ...matchScore };

    this.propagateWinners(bracket);
    this.calculateMedals(bracket);

    return bracket;
  },

  // Propagate winners strictly if preceding match is Completed
  propagateWinners(bracket) {
    const m = bracket.matches;

    // R2: Matches 9..12
    m[8].aao = m[0].status === 'Completed' ? m[0].winner : null;
    m[8].aka = m[1].status === 'Completed' ? m[1].winner : null;
    m[9].aao = m[2].status === 'Completed' ? m[2].winner : null;
    m[9].aka = m[3].status === 'Completed' ? m[3].winner : null;
    m[10].aao = m[4].status === 'Completed' ? m[4].winner : null;
    m[10].aka = m[5].status === 'Completed' ? m[5].winner : null;
    m[11].aao = m[6].status === 'Completed' ? m[6].winner : null;
    m[11].aka = m[7].status === 'Completed' ? m[7].winner : null;

    for (let i = 8; i <= 11; i++) {
      if (m[i].status !== 'Completed') {
        m[i].status = (m[i].aao || m[i].aka) ? 'Scheduled' : 'Pending';
      }
    }

    // R3 (Semi-Finals): Matches 13..14
    m[12].aao = m[8].status === 'Completed' ? m[8].winner : null;
    m[12].aka = m[9].status === 'Completed' ? m[9].winner : null;
    m[13].aao = m[10].status === 'Completed' ? m[10].winner : null;
    m[13].aka = m[11].status === 'Completed' ? m[11].winner : null;

    for (let i = 12; i <= 13; i++) {
      if (m[i].status !== 'Completed') {
        m[i].status = (m[i].aao || m[i].aka) ? 'Scheduled' : 'Pending';
      }
    }

    // R4 (Final): Match 15
    m[14].aao = m[12].status === 'Completed' ? m[12].winner : null;
    m[14].aka = m[13].status === 'Completed' ? m[13].winner : null;

    if (m[14].status !== 'Completed') {
      m[14].status = (m[14].aao || m[14].aka) ? 'Scheduled' : 'Pending';
    }
  },

  // Re-build downstream matches when a match is undone
  rebuildDownstream(bracket) {
    const m = bracket.matches;

    // Reset status of matches whose inputs changed
    for (let i = 8; i < 15; i++) {
      // Re-evaluate inputs
      this.propagateWinners(bracket);
    }
  },

  calculateMedals(bracket) {
    const m = bracket.matches;
    bracket.medals = { gold: null, silver: null, bronze1: null, bronze2: null };

    const sem1Loser = m[12].status === 'Completed' ? m[12].loser : null;
    const sem2Loser = m[13].status === 'Completed' ? m[13].loser : null;

    if (sem1Loser) bracket.medals.bronze1 = sem1Loser;
    if (sem2Loser) bracket.medals.bronze2 = sem2Loser;

    const finalMatch = m[14];
    if (finalMatch.status === 'Completed' && finalMatch.winner) {
      bracket.medals.gold = finalMatch.winner;
      bracket.medals.silver = finalMatch.loser;
    }
  }
};

window.BracketEngine = BracketEngine;
