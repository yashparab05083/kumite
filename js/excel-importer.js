/**
 * Excel Importer & Bout Grouping Engine for Shotokan Karate Championship
 */

const ExcelImporter = {
  cleanParticipantName(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/^\s*[\(\[\{]\s*[YNyn]\s*[\)\]\}]\s*/i, '') // Strips leading (Y), (N), [Y], [N], etc.
      .replace(/^\s*[YNyn]\s*[-\/:;]\s*/i, '')             // Strips leading Y -, N -, Y:, N:, etc.
      .replace(/\s*[\(\[\{]\s*[YNyn]\s*[\)\]\}]\s*$/i, '') // Strips trailing (Y), (N), [Y], [N], etc.
      .replace(/\s*[-\/:;]\s*[YNyn]\s*$/i, '')             // Strips trailing - Y, - N, etc.
      .trim();
  },

  // Normalize belt values to integer Kyu (9 to 1) or Dan (-1 to -9)
  parseBelt(beltValue) {
    if (beltValue === undefined || beltValue === null) return 9;
    const str = String(beltValue).trim().toLowerCase();
    
    // Numeric check
    const num = parseInt(str, 10);
    if (!isNaN(num) && num !== 0 && num >= -9 && num <= 9) {
      return num;
    }

    const has = (term) => str.indexOf(term) !== -1;

    // String name mappings
    if (has('white') || has('kyu 9') || has('9th kyu')) return 9;
    if (has('orange') || has('kyu 8') || has('8th kyu')) return 8;
    if (has('yellow') || has('kyu 7') || has('7th kyu')) return 7;
    if (has('green') || has('kyu 6') || has('6th kyu')) return 6;
    if (has('blue') || has('kyu 5') || has('5th kyu')) return 5;
    if (has('purple') || has('kyu 4') || has('4th kyu')) return 4;
    if (has('brown 3') || has('3rd brown') || has('kyu 3')) return 3;
    if (has('brown 2') || has('2nd brown') || has('kyu 2')) return 2;
    if (has('brown 1') || has('1st brown') || has('kyu 1')) return 1;
    if (has('brown')) return 2;
    
    // Dan ranks (-1 to -9)
    if (has('shodan') || has('1st dan') || has('black 1')) return -1;
    if (has('nidan') || has('2nd dan') || has('black 2')) return -2;
    if (has('sandan') || has('3rd dan') || has('black 3')) return -3;
    if (has('yondan') || has('4th dan') || has('black 4')) return -4;
    if (has('godan') || has('5th dan') || has('black 5')) return -5;
    if (has('rokudan') || has('6th dan') || has('black 6')) return -6;
    if (has('nanadan') || has('7th dan') || has('black 7')) return -7;
    if (has('hachidan') || has('8th dan') || has('black 8')) return -8;
    if (has('kudan') || has('9th dan') || has('black 9')) return -9;
    if (has('black')) return -1;

    return 9;
  },

  getBeltLabel(beltCode) {
    const labels = {
      9: 'Kyu 9 (White)',
      8: 'Kyu 8 (Orange)',
      7: 'Kyu 7 (Yellow)',
      6: 'Kyu 6 (Green)',
      5: 'Kyu 5 (Blue)',
      4: 'Kyu 4 (Purple)',
      3: 'Kyu 3 (Brown 3)',
      2: 'Kyu 2 (Brown 2)',
      1: 'Kyu 1 (Brown 1)',
      '-1': 'Shodan (-1)',
      '-2': 'Nidan (-2)',
      '-3': 'Sandan (-3)',
      '-4': 'Yondan (-4)',
      '-5': 'Godan (-5)',
      '-6': 'Rokudan (-6)',
      '-7': 'Nanadan (-7)',
      '-8': 'Hachidan (-8)',
      '-9': 'Kudan (-9)'
    };
    return labels[beltCode] || `Belt ${beltCode}`;
  },

  getBeltTier(beltCode) {
    if (beltCode >= 7) return 'Beginner';
    if (beltCode >= 4) return 'Intermediate';
    if (beltCode >= 1) return 'Advanced';
    return 'Black Belt';
  },

  // Read Excel File from File Input
  parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            throw new Error('Excel file contains no readable sheets.');
          }

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

          if (!jsonRows || !Array.isArray(jsonRows) || jsonRows.length === 0) {
            throw new Error('No data rows found in Excel sheet.');
          }

          const participants = [];

          jsonRows.forEach((row, index) => {
            if (!row || typeof row !== 'object') return;
            const keys = Object.keys(row);
            if (keys.length === 0) return;

            const findVal = (terms) => {
              if (!terms || !Array.isArray(terms)) return '';
              const matchedKey = keys.find(k => {
                if (k === undefined || k === null) return false;
                const kLower = String(k).toLowerCase();
                return terms.some(t => {
                  if (t === undefined || t === null) return false;
                  return kLower.indexOf(String(t).toLowerCase()) !== -1;
                });
              });
              return matchedKey ? row[matchedKey] : '';
            };

            const rawName = findVal(['name', 'participant', 'athlete', 'student', 'competitor', 'player', 'fullname']);
            const name = this.cleanParticipantName(rawName);
            if (!name) return; // Skip empty rows without participant names

            const rawGender = findVal(['gender', 'sex', 'm/f', 'm_f', 'mf', 'boy/girl', 'male/female', 'boy / girl', 'male / female']);
            const rawCategory = findVal(['category', 'cat', 'group', 'event']);
            
            const genderVal = (rawGender !== undefined && rawGender !== null) ? String(rawGender).trim().toLowerCase() : '';
            const catVal = (rawCategory !== undefined && rawCategory !== null) ? String(rawCategory).trim().toLowerCase() : '';

            let gender = 'Male';
            if (
              genderVal.startsWith('f') || 
              genderVal.indexOf('female') !== -1 || 
              genderVal.indexOf('girl') !== -1 || 
              genderVal === 'w' || 
              genderVal.indexOf('women') !== -1
            ) {
              gender = 'Female';
            } else if (
              genderVal.startsWith('m') || 
              genderVal.indexOf('male') !== -1 || 
              genderVal.indexOf('boy') !== -1 || 
              genderVal === 'men'
            ) {
              gender = 'Male';
            } else if (
              catVal.indexOf('female') !== -1 || 
              catVal.indexOf('girl') !== -1 || 
              catVal.indexOf('women') !== -1 || 
              catVal.indexOf('girls') !== -1
            ) {
              gender = 'Female';
            } else if (
              catVal.indexOf('male') !== -1 || 
              catVal.indexOf('boy') !== -1 || 
              catVal.indexOf('men') !== -1 || 
              catVal.indexOf('boys') !== -1
            ) {
              gender = 'Male';
            }

            const rawAge = findVal(['age', 'years', 'yr', 'group', 'category', 'cat']);
            const ageCategory = this.getAgeCategory(rawAge);
            const ageStr = (rawAge !== undefined && rawAge !== null) ? String(rawAge).replace(/[^0-9]/g, '') : '';
            const ageNum = parseInt(ageStr, 10);
            const age = isNaN(ageNum) ? 10 : ageNum;

            const beltRaw = findVal(['kyu', 'belt', 'dan', 'grade', 'rank']);
            const belt = this.parseBelt(beltRaw);
            
            const rawBranch = findVal(['branch', 'dojo', 'club', 'school', 'academy', 'team']);
            const branch = (rawBranch !== undefined && rawBranch !== null && String(rawBranch).trim() !== '') ? String(rawBranch).trim() : 'Main Branch';

            const rawBout = findVal(['bout', 'kata bout', 'bouts', 'katabout', 'group', 'bout code']);
            const bout = (rawBout !== undefined && rawBout !== null && String(rawBout).trim() !== '') 
              ? String(rawBout).trim() 
              : '';

            const rawWeight = findVal(['weight', 'wt', 'kg', 'weight class']);
            const weight = (rawWeight !== undefined && rawWeight !== null && String(rawWeight).trim() !== '') 
              ? String(rawWeight).trim() 
              : '';

            participants.push({
              id: 'p_' + Math.random().toString(36).substr(2, 9),
              name,
              gender,
              age,
              ageCategory,
              belt,
              beltLabel: this.getBeltLabel(belt),
              beltTier: this.getBeltTier(belt),
              branch,
              bout,
              weight
            });
          });

          if (participants.length === 0) {
            throw new Error('No valid participant entries found in Excel file. Please ensure columns include Name, Age, Gender, and Belt/Kyu.');
          }

          resolve(participants);
        } catch (err) {
          console.error('Excel Import Parse Error:', err);
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  },

  // Derive Age Category Name based on Official Tournament Age Segregation Rules
  getAgeCategory(ageVal) {
    if (ageVal === undefined || ageVal === null || ageVal === '') return '4 & 5 Years';

    const str = String(ageVal).trim().toLowerCase();
    const hasStr = (substr) => str.indexOf(substr) !== -1;

    // Check string matchers first
    if ((hasStr('4') && hasStr('5')) || hasStr('4&5') || hasStr('4-5') || hasStr('4,5')) return '4 & 5 Years';
    if ((hasStr('13') && hasStr('14')) || hasStr('13&14') || hasStr('13-14') || hasStr('13,14')) return '13 & 14 Years';
    if (hasStr('15') || hasStr('16') || hasStr('17')) return '15, 16 & 17 Years';
    if (hasStr('18') || hasStr('above') || hasStr('senior') || hasStr('+') || hasStr('adult')) return '18 Years & Above';

    // Parse numeric age
    const cleanNumStr = str.replace(/[^0-9]/g, '');
    const ageNum = parseInt(cleanNumStr, 10);
    if (isNaN(ageNum) || ageNum <= 5) return '4 & 5 Years';
    if (ageNum === 6) return '6 Years';
    if (ageNum === 7) return '7 Years';
    if (ageNum === 8) return '8 Years';
    if (ageNum === 9) return '9 Years';
    if (ageNum === 10) return '10 Years';
    if (ageNum === 11) return '11 Years';
    if (ageNum === 12) return '12 Years';
    if (ageNum === 13 || ageNum === 14) return '13 & 14 Years';
    if (ageNum >= 15 && ageNum <= 17) return '15, 16 & 17 Years';
    return '18 Years & Above';
  },

  // Auto-generate Bout Groups from Pre-sorted Excel Participant List
  generateBoutGroups(participants, eventMode = 'both') {
    const getBoutLetter = (index) => {
      let letter = '';
      let i = index;
      while (i >= 0) {
        letter = String.fromCharCode(97 + (i % 26)) + letter;
        i = Math.floor(i / 26) - 1;
      }
      return letter;
    };

    // Step 1: Group participants by Age Category & Gender
    const ageGenderBins = {};

    participants.forEach(p => {
      const ageCat = this.getAgeCategory(p.ageCategory || p.age);
      const gender = p.gender || 'Male';
      const key = `${ageCat}_${gender}`;
      if (!ageGenderBins[key]) {
        ageGenderBins[key] = {
          ageCat,
          gender,
          participants: []
        };
      }
      ageGenderBins[key].participants.push(p);
    });

    const bouts = [];

    // Step 2: Process each Age & Gender bin independently
    Object.keys(ageGenderBins).forEach(agKey => {
      const agBin = ageGenderBins[agKey];
      const pList = agBin.participants;
      if (!pList || pList.length === 0) return;

      // Group participants into Kata bouts based on Excel 'bout' column or contiguous order
      const kataBoutMap = new Map();
      let autoIndex = 0;

      pList.forEach(p => {
        let bKey = (p.bout || '').trim().toLowerCase();
        if (!bKey) {
          bKey = `auto_${autoIndex}`;
        }
        if (!kataBoutMap.has(bKey)) {
          kataBoutMap.set(bKey, {
            originalKey: (p.bout || '').trim(),
            participants: []
          });
        }
        kataBoutMap.get(bKey).participants.push(p);
      });

      // Build ordered array of Kata bouts
      const rawKataBouts = [];
      let fallbackIndex = 0;

      kataBoutMap.forEach((gData) => {
        let displayLetter = gData.originalKey.toLowerCase();
        if (!displayLetter) {
          displayLetter = getBoutLetter(fallbackIndex);
        }
        fallbackIndex++;

        const cleanAgeCode = agBin.ageCat.toLowerCase().replace(/[^a-z0-9]/g, '');
        const boutCode = `${cleanAgeCode}_kata_${displayLetter}`;
        const boutName = `${agBin.ageCat} ${agBin.gender} Kata Bout ${displayLetter}`;

        const firstP = gData.participants[0];
        const beltLabel = firstP ? firstP.beltLabel : 'General';
        const beltTier = firstP ? firstP.beltTier : 'General';

        const kataBoutObj = {
          id: 'bout_kata_' + Math.random().toString(36).substr(2, 9),
          boutCode,
          boutName,
          eventType: 'Kata',
          ageCategory: agBin.ageCat,
          gender: agBin.gender,
          beltTier,
          beltLabel,
          boutLetter: displayLetter,
          participants: gData.participants,
          status: 'Pending',
          tatamiId: null
        };

        rawKataBouts.push(kataBoutObj);
      });

      // Step 3: Pair consecutive Kata Bouts into Kumite Bouts & Interleave Listing Sequence!
      // Output sequence for pair (Kata A, Kata B):
      // 1. Kata Bout a
      // 2. Kata Bout b
      // 3. Kumite Bout a & b
      for (let k = 0; k < rawKataBouts.length; k += 2) {
        const kataA = rawKataBouts[k];
        const kataB = rawKataBouts[k + 1]; // may be undefined if odd count

        // 1 & 2: Push Kata bouts first in pairs
        if (eventMode === 'kata' || eventMode === 'both') {
          if (kataA) bouts.push(kataA);
          if (kataB) bouts.push(kataB);
        }

        // 3: Push merged Kumite bout immediately following the two Kata bouts
        if (eventMode === 'kumite' || eventMode === 'both') {
          let kumiteParticipants = [];
          let kumiteLetterName = '';
          let kumiteCodeName = '';

          if (kataA && kataB) {
            kumiteParticipants = [...kataA.participants, ...kataB.participants];
            kumiteLetterName = `${kataA.boutLetter} & ${kataB.boutLetter}`;
            kumiteCodeName = `${kataA.boutLetter}_${kataB.boutLetter}`;
          } else if (kataA) {
            kumiteParticipants = [...kataA.participants];
            kumiteLetterName = `${kataA.boutLetter}`;
            kumiteCodeName = `${kataA.boutLetter}`;
          }

          const cleanAgeCode = agBin.ageCat.toLowerCase().replace(/[^a-z0-9]/g, '');
          const kumiteBoutCode = `${cleanAgeCode}_kumite_${kumiteCodeName}`;
          const kumiteBoutName = `${agBin.ageCat} ${agBin.gender} Kumite Bout ${kumiteLetterName}`;

          const kumiteBoutObj = {
            id: 'bout_kumite_' + Math.random().toString(36).substr(2, 9),
            boutCode: kumiteBoutCode,
            boutName: kumiteBoutName,
            eventType: 'Kumite',
            ageCategory: agBin.ageCat,
            gender: agBin.gender,
            beltTier: kataA ? kataA.beltTier : 'General',
            beltLabel: kataA ? kataA.beltLabel : 'General',
            participants: kumiteParticipants,
            status: 'Pending',
            tatamiId: null
          };

          bouts.push(kumiteBoutObj);
        }
      }
    });

    return bouts;
  },

  distributeParticipantsWithBranchSeparation(list, numGroups) {
    if (!list || list.length === 0) return [];
    if (numGroups <= 1) return [[...list]];

    const branchMap = {};
    list.forEach(p => {
      const b = (p.branch || 'Unknown').trim();
      if (!branchMap[b]) branchMap[b] = [];
      branchMap[b].push(p);
    });

    const sortedBranches = Object.keys(branchMap).sort((a, b) => branchMap[b].length - branchMap[a].length);

    const groups = Array.from({ length: numGroups }, () => []);
    const branchCountsInGroup = Array.from({ length: numGroups }, () => ({}));

    sortedBranches.forEach(branch => {
      const branchParticipants = branchMap[branch];
      const schoolKids = branchParticipants.filter(p => p.schoolHours);
      const regularKids = branchParticipants.filter(p => !p.schoolHours);
      const ordered = [...schoolKids, ...regularKids];

      ordered.forEach(p => {
        let bestGroupIdx = 0;
        let minBranchCount = Infinity;
        let minTotalSize = Infinity;

        for (let g = 0; g < numGroups; g++) {
          const bCount = branchCountsInGroup[g][branch] || 0;
          const totalSize = groups[g].length;

          if (bCount < minBranchCount) {
            minBranchCount = bCount;
            minTotalSize = totalSize;
            bestGroupIdx = g;
          } else if (bCount === minBranchCount) {
            if (totalSize < minTotalSize) {
              minTotalSize = totalSize;
              bestGroupIdx = g;
            }
          }
        }

        groups[bestGroupIdx].push(p);
        branchCountsInGroup[bestGroupIdx][branch] = (branchCountsInGroup[bestGroupIdx][branch] || 0) + 1;
      });
    });

    return groups;
  },

  splitKataSubgroupsWithBranchSeparation(list) {
    if (!list || list.length === 0) return [[], []];

    const branchMap = {};
    list.forEach(p => {
      const b = (p.branch || 'Unknown').trim();
      if (!branchMap[b]) branchMap[b] = [];
      branchMap[b].push(p);
    });

    const sortedBranches = Object.keys(branchMap).sort((a, b) => branchMap[b].length - branchMap[a].length);

    const sub1 = [];
    const sub2 = [];
    const sub1BranchCounts = {};
    const sub2BranchCounts = {};

    sortedBranches.forEach(branch => {
      const branchParticipants = branchMap[branch];
      branchParticipants.forEach((p) => {
        const c1 = sub1BranchCounts[branch] || 0;
        const c2 = sub2BranchCounts[branch] || 0;

        let chooseSub1 = false;
        if (c1 < c2) {
          chooseSub1 = true;
        } else if (c2 < c1) {
          chooseSub1 = false;
        } else {
          chooseSub1 = sub1.length <= sub2.length;
        }

        if (chooseSub1) {
          sub1.push(p);
          sub1BranchCounts[branch] = c1 + 1;
        } else {
          sub2.push(p);
          sub2BranchCounts[branch] = c2 + 1;
        }
      });
    });

    return [sub1, sub2];
  }
};

window.ExcelImporter = ExcelImporter;
