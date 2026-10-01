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
    if (bout.eventType === 'Kata') {
      return this.createKataBracket(bout);
    }

    const rawParticipants = [...bout.participants];
    const slots = this.assignBracketSlotsWithBranchSeparation(rawParticipants);

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

  assignBracketSlotsWithBranchSeparation(participants) {
    const slots = Array(16).fill(null);
    if (!participants || participants.length === 0) return slots;

    // Group by Branch / Dojo
    const branchGroups = {};
    participants.forEach(p => {
      const b = (p.branch || 'Unknown').trim();
      if (!branchGroups[b]) branchGroups[b] = [];
      branchGroups[b].push(p);
    });

    // Sort branches by count descending
    const sortedBranches = Object.keys(branchGroups).sort((a, b) => branchGroups[b].length - branchGroups[a].length);

    // Interleave participants across branches to form a balanced sequence
    const interleavedList = [];
    while (interleavedList.length < participants.length) {
      let added = false;
      for (let i = 0; i < sortedBranches.length; i++) {
        const b = sortedBranches[i];
        if (branchGroups[b].length > 0) {
          interleavedList.push(branchGroups[b].shift());
          added = true;
        }
      }
      if (!added) break;
    }

    // INFINITY_SEED_MAP seed indices mapping:
    // Left Pool seed indices:  [0, 3, 4, 7, 8, 11, 12, 15] -> Slots: 0 (M1 Top), 7 (M4 Bottom), 2 (M2), 5 (M3), 1 (M1 AKA), 6 (M4 AAO), 3 (M2 AKA), 4 (M3 AAO)
    // Right Pool seed indices: [1, 2, 5, 6, 9, 10, 13, 14] -> Slots: 15 (M8 Bottom), 8 (M5 Top), 13 (M7), 10 (M6), 14 (M8 AAO), 9 (M5 AKA), 12 (M7 AAO), 11 (M6 AKA)
    const leftPoolSeedIndices = [0, 3, 4, 7, 8, 11, 12, 15];
    const rightPoolSeedIndices = [1, 2, 5, 6, 9, 10, 13, 14];

    const usedSeedIndices = new Set();
    const branchPoolCounts = {}; // Track left/right pool count per branch

    interleavedList.forEach(p => {
      const b = (p.branch || 'Unknown').trim();
      if (!branchPoolCounts[b]) branchPoolCounts[b] = { left: 0, right: 0 };

      // Prefer pool where branch currently has fewer participants
      let preferLeft = true;
      if (branchPoolCounts[b].left > branchPoolCounts[b].right) {
        preferLeft = false;
      } else if (branchPoolCounts[b].right > branchPoolCounts[b].left) {
        preferLeft = true;
      } else {
        // Equal count for this branch: pick whichever pool has the smaller next available seed index
        const nextLeft = leftPoolSeedIndices.find(idx => !usedSeedIndices.has(idx));
        const nextRight = rightPoolSeedIndices.find(idx => !usedSeedIndices.has(idx));
        if (nextLeft !== undefined && nextRight !== undefined) {
          preferLeft = nextLeft < nextRight;
        } else if (nextLeft !== undefined) {
          preferLeft = true;
        } else {
          preferLeft = false;
        }
      }

      let chosenSeedIdx = undefined;

      if (preferLeft) {
        chosenSeedIdx = leftPoolSeedIndices.find(idx => !usedSeedIndices.has(idx));
        if (chosenSeedIdx === undefined) {
          chosenSeedIdx = rightPoolSeedIndices.find(idx => !usedSeedIndices.has(idx));
        }
      } else {
        chosenSeedIdx = rightPoolSeedIndices.find(idx => !usedSeedIndices.has(idx));
        if (chosenSeedIdx === undefined) {
          chosenSeedIdx = leftPoolSeedIndices.find(idx => !usedSeedIndices.has(idx));
        }
      }

      if (chosenSeedIdx !== undefined) {
        usedSeedIndices.add(chosenSeedIdx);

        if (leftPoolSeedIndices.includes(chosenSeedIdx)) {
          branchPoolCounts[b].left++;
        } else {
          branchPoolCounts[b].right++;
        }

        const slotIdx = this.INFINITY_SEED_MAP[chosenSeedIdx];
        slots[slotIdx] = { ...p, seedNumber: chosenSeedIdx + 1 };
      }
    });

    return slots;
  },

  applyBranchSeparation(participants) {
    return this.assignBracketSlotsWithBranchSeparation(participants);
  },

  // Helper: check if a feeder match is finished/resolved (Completed OR Empty)
  isFeederDone(match) {
    if (!match) return true;
    return match.status === 'Completed' || match.status === 'Empty';
  },

  // Check if a BYE match is allowed to advance
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

    // Preceding feeder matches MUST be done (Completed OR Empty)
    if (!this.isFeederDone(aaoFeeder) || !this.isFeederDone(akaFeeder)) {
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

    const isAaoWinner = winnerSide === 'aao' || winnerSide === 'blue';
    const winner = isAaoWinner ? targetMatch.aao : targetMatch.aka;
    const loser = isAaoWinner ? targetMatch.aka : targetMatch.aao;

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
        const hasFeederReady = (this.isFeederDone(m[(i - 8) * 2]) && this.isFeederDone(m[(i - 8) * 2 + 1]));
        if (hasFeederReady && (m[i].aao || m[i].aka)) {
          m[i].status = 'Scheduled';
        } else if (!m[i].aao && !m[i].aka) {
          m[i].status = hasFeederReady ? 'Empty' : 'Pending';
        }
      }
    }

    // R3 (Semi-Finals): Matches 13..14
    m[12].aao = m[8].status === 'Completed' ? m[8].winner : null;
    m[12].aka = m[9].status === 'Completed' ? m[9].winner : null;
    m[13].aao = m[10].status === 'Completed' ? m[10].winner : null;
    m[13].aka = m[11].status === 'Completed' ? m[11].winner : null;

    for (let i = 12; i <= 13; i++) {
      if (m[i].status !== 'Completed') {
        const feeder1 = m[(i - 12) * 2 + 8];
        const feeder2 = m[(i - 12) * 2 + 9];
        const hasFeederReady = (this.isFeederDone(feeder1) && this.isFeederDone(feeder2));
        if (hasFeederReady && (m[i].aao || m[i].aka)) {
          m[i].status = 'Scheduled';
        } else if (!m[i].aao && !m[i].aka) {
          m[i].status = hasFeederReady ? 'Empty' : 'Pending';
        }
      }
    }

    // R4 (Final): Match 15
    m[14].aao = m[12].status === 'Completed' ? m[12].winner : null;
    m[14].aka = m[13].status === 'Completed' ? m[13].winner : null;

    if (m[14].status !== 'Completed') {
      const hasFeederReady = (this.isFeederDone(m[12]) && this.isFeederDone(m[13]));
      if (hasFeederReady && (m[14].aao || m[14].aka)) {
        m[14].status = 'Scheduled';
      } else if (!m[14].aao && !m[14].aka) {
        m[14].status = hasFeederReady ? 'Empty' : 'Pending';
      }
    }
  },

  rebuildDownstream(bracket) {
    this.propagateWinners(bracket);
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
  },

  // --- KATA SCORING & TIE-BREAKER ENGINE ---

  createKataBracket(bout) {
    const rawParticipants = [...bout.participants];
    const interleavedParticipants = this.interleaveKataBranchParticipants(rawParticipants);

    const competitors = interleavedParticipants.map((p, idx) => ({
      id: p.id,
      no: idx + 1,
      name: p.name,
      branch: p.branch,
      age: p.age,
      beltLabel: p.beltLabel,
      scores: [5.0, 5.0, 5.0, 5.0, 5.0],
      hasScored: false,
      totalScore: 0,
      place: null
    }));

    const bracket = {
      id: bout.id,
      boutId: bout.id,
      boutCode: bout.boutCode,
      boutName: bout.boutName,
      eventType: 'Kata',
      ageCategory: bout.ageCategory,
      gender: bout.gender,
      beltTier: bout.beltTier,
      competitors,
      medals: { gold: null, silver: null, bronze1: null, bronze2: null },
      referees: ['Referee 1', 'Referee 2', 'Referee 3', 'Referee 4', 'Referee 5'],
      tieBreaker: {
        flagVote: null,
        rescoreRound: null
      }
    };

    this.recalculateKataRanks(bracket);
    return bracket;
  },

  interleaveKataBranchParticipants(participants) {
    if (!participants || participants.length <= 2) return [...participants];

    const branchMap = {};
    participants.forEach(p => {
      const b = (p.branch || 'Unknown').trim();
      if (!branchMap[b]) branchMap[b] = [];
      branchMap[b].push(p);
    });

    const sortedBranches = Object.keys(branchMap).sort((a, b) => branchMap[b].length - branchMap[a].length);

    const result = [];
    while (result.length < participants.length) {
      let added = false;
      for (let i = 0; i < sortedBranches.length; i++) {
        const b = sortedBranches[i];
        if (branchMap[b].length > 0) {
          result.push(branchMap[b].shift());
          added = true;
        }
      }
      if (!added) break;
    }

    return result;
  },

  recalculateKataRanks(bracket) {
    if (!bracket || bracket.eventType !== 'Kata') return;

    bracket.competitors.forEach(comp => {
      if (!Array.isArray(comp.scores) || comp.scores.length !== 5) {
        comp.scores = [5.0, 5.0, 5.0, 5.0, 5.0];
      }
      if (comp.hasScored === undefined) {
        const hasNonDefaultScore = comp.scores.some(s => parseFloat(s) !== 5.0 && parseFloat(s) !== 0);
        comp.hasScored = (comp.totalScore > 0) || hasNonDefaultScore;
      }

      if (comp.hasScored) {
        const sum = comp.scores.reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
        comp.totalScore = Math.round(sum * 100) / 100;
      } else {
        comp.totalScore = 0;
      }
    });

    const activeScored = bracket.competitors.filter(c => c.hasScored && c.totalScore > 0);

    // Reset places and medals
    bracket.competitors.forEach(c => c.place = null);
    bracket.medals = { gold: null, silver: null, bronze1: null, bronze2: null };

    if (!bracket.tieBreaker) {
      bracket.tieBreaker = { activeTie: null, flagVote: null, rescoreRound: null };
    }

    if (activeScored.length === 0) {
      bracket.tieBreaker.activeTie = null;
      bracket.tieBreaker.flagVote = null;
      bracket.tieBreaker.rescoreRound = null;
      return;
    }

    // Group active scored by totalScore
    const scoreBins = {};
    activeScored.forEach(c => {
      const scoreKey = c.totalScore.toFixed(2);
      if (!scoreBins[scoreKey]) scoreBins[scoreKey] = [];
      scoreBins[scoreKey].push(c);
    });

    const sortedKeys = Object.keys(scoreBins).map(Number).sort((a, b) => b - a);
    let currentRank = 1;

    for (let i = 0; i < sortedKeys.length; i++) {
      const scoreKey = sortedKeys[i];
      const bin = scoreBins[scoreKey.toFixed(2)];

      if (bin.length === 1) {
        const c = bin[0];
        c.place = currentRank;
        currentRank += 1;
      } else if (bin.length === 2) {
        // 2-Way Tie
        if (currentRank <= 2) {
          const flagWinnerId = bracket.tieBreaker.flagVote ? bracket.tieBreaker.flagVote.winnerId : null;

          if (flagWinnerId && bin.some(c => c.id === flagWinnerId)) {
            const winner = bin.find(c => c.id === flagWinnerId);
            const loser = bin.find(c => c.id !== flagWinnerId);
            winner.place = currentRank;
            loser.place = currentRank + 1;
            currentRank += 2;
          } else {
            bin.forEach(c => c.place = currentRank);
            bracket.tieBreaker.activeTie = '2WAY_FLAG';
            bracket.tieBreaker.rescoreRound = null;
            bracket.tieBreaker.flagVote = {
              type: '2WAY_FLAG',
              tiedIds: bin.map(c => c.id),
              winnerId: null
            };
            currentRank += 2;
            break; // Stop ranking until 2-way flag tie resolved
          }
        } else {
          // Bronze tie is allowed (dual 3rd place)
          bin.forEach(c => c.place = currentRank);
          currentRank += 2;
        }
      } else if (bin.length >= 3) {
        // 3+ Way Tie
        bin.forEach(c => c.place = currentRank);

        const rescore = bracket.tieBreaker.rescoreRound;
        const currentTiedKey = bin.map(c => c.id).sort().join(',');

        if (!rescore || (rescore.tiedIds.sort().join(',') !== currentTiedKey)) {
          // Create new Re-Score Round for 3+ tied contestants
          bracket.tieBreaker.activeTie = '3WAY_RESCORE';
          bracket.tieBreaker.flagVote = null;
          bracket.tieBreaker.rescoreRound = {
            type: '3WAY_RESCORE',
            tiedIds: bin.map(c => c.id),
            competitors: bin.map((c, idx) => ({
              id: c.id,
              no: idx + 1,
              name: c.name,
              branch: c.branch,
              scores: [0, 0, 0, 0, 0],
              totalScore: 0,
              place: null
            }))
          };
          break;
        } else {
          // Evaluate existing 3+ Way Re-Score Round
          const allRescored = rescore.competitors.every(rc => rc.scores.some(s => parseFloat(s) > 0));

          if (!allRescored) {
            bracket.tieBreaker.activeTie = '3WAY_RESCORE';
            bracket.tieBreaker.flagVote = null;
            break; // Wait for operator to enter re-scores
          }

          // Compute re-score totals
          rescore.competitors.forEach(rc => {
            const sum = rc.scores.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);
            rc.totalScore = Math.round(sum * 100) / 100;
          });

          // Group re-scores by totalScore
          const rescoreBins = {};
          rescore.competitors.forEach(rc => {
            const k = rc.totalScore.toFixed(2);
            if (!rescoreBins[k]) rescoreBins[k] = [];
            rescoreBins[k].push(rc);
          });

          const sortedRescoreKeys = Object.keys(rescoreBins).map(Number).sort((a, b) => b - a);
          let subRank = currentRank;
          let subTieFound = false;

          for (let rk of sortedRescoreKeys) {
            const rBin = rescoreBins[rk.toFixed(2)];
            if (rBin.length === 1) {
              const mainC = bin.find(c => c.id === rBin[0].id);
              if (mainC) mainC.place = subRank;
              subRank += 1;
            } else if (rBin.length === 2) {
              // Re-score produced a 2-Way Tie! Transition to 2WAY_FLAG window
              subTieFound = true;
              const flagWinnerId = bracket.tieBreaker.flagVote ? bracket.tieBreaker.flagVote.winnerId : null;

              if (flagWinnerId && rBin.some(c => c.id === flagWinnerId)) {
                const winnerC = bin.find(c => c.id === flagWinnerId);
                const loserC = bin.find(c => c.id !== flagWinnerId && rBin.some(rb => rb.id === c.id));
                if (winnerC) winnerC.place = subRank;
                if (loserC) loserC.place = subRank + 1;
                subRank += 2;
              } else {
                bracket.tieBreaker.activeTie = '2WAY_FLAG';
                bracket.tieBreaker.flagVote = {
                  type: '2WAY_FLAG',
                  tiedIds: rBin.map(c => c.id),
                  winnerId: null
                };
                subRank += 2;
                break;
              }
            } else if (rBin.length >= 3) {
              // Re-score produced another 3-Way Tie! Reset re-scores for Next Round
              subTieFound = true;
              rBin.forEach(rc => rc.scores = [0, 0, 0, 0, 0]);
              bracket.tieBreaker.activeTie = '3WAY_RESCORE';
              bracket.tieBreaker.flagVote = null;
              break;
            }
          }

          if (subTieFound && bracket.tieBreaker.activeTie) {
            break;
          }

          // If all ties in re-score resolved cleanly
          bracket.tieBreaker.activeTie = null;
          bracket.tieBreaker.flagVote = null;
          currentRank += bin.length;
        }
      }
    }

    // Assign Medals based on final places
    bracket.competitors.forEach(c => {
      if (c.place === 1) bracket.medals.gold = c;
      else if (c.place === 2) bracket.medals.silver = c;
      else if (c.place === 3) {
        if (!bracket.medals.bronze1) bracket.medals.bronze1 = c;
        else if (!bracket.medals.bronze2) bracket.medals.bronze2 = c;
      } else if (c.place === 4 && !bracket.medals.bronze2) {
        bracket.medals.bronze2 = c;
      }
    });

    // Fallback dual bronze if unassigned
    if (!bracket.medals.bronze1 && activeScored.length >= 3) {
      bracket.medals.bronze1 = activeScored[2] || null;
    }
    if (!bracket.medals.bronze2 && activeScored.length >= 4) {
      bracket.medals.bronze2 = activeScored[3] || null;
    }
  }
};

window.BracketEngine = BracketEngine;
