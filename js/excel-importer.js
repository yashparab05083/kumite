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

            const beltRaw = findVal(['belt', 'kyu', 'dan', 'grade', 'rank']);
            const belt = this.parseBelt(beltRaw);
            
            const rawBranch = findVal(['branch', 'dojo', 'club', 'school', 'academy', 'team']);
            const branch = (rawBranch !== undefined && rawBranch !== null && String(rawBranch).trim() !== '') ? String(rawBranch).trim() : 'Main Branch';
            
            const rawInstructor = findVal(['instructor', 'sensei', 'coach', 'master', 'teacher']);
            const instructor = (rawInstructor !== undefined && rawInstructor !== null) ? String(rawInstructor).trim() : '';

            const schoolHoursVal = (findVal(['school hours', 'school hour', 'school', 'sh', 'hours']) || '').toString().trim().toLowerCase();
            const schoolHours = schoolHoursVal.startsWith('y') || schoolHoursVal === 'true' || schoolHoursVal === '1' || schoolHoursVal.indexOf('yes') !== -1;

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
              instructor,
              schoolHours
            });
          });

          if (participants.length === 0) {
            throw new Error('No valid participant entries found in Excel file. Please ensure columns include Name, Age, Gender, and Belt.');
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

  // Auto-generate Bout Groups from Participant List
  generateBoutGroups(participants, eventMode = 'both') {
    // Helper for generating bout letter codes: 0 -> 'a', 1 -> 'b', ..., 25 -> 'z', 26 -> 'aa', 27 -> 'ab'...
    const getBoutLetter = (index) => {
      let letter = '';
      let i = index;
      while (i >= 0) {
        letter = String.fromCharCode(97 + (i % 26)) + letter;
        i = Math.floor(i / 26) - 1;
      }
      return letter;
    };

    // Step 1: Group by Age Category & Gender (Strict requirement: Same age and gender mandatory)
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

    // Process each Age & Gender bin independently
    Object.keys(ageGenderBins).forEach(agKey => {
      const agBin = ageGenderBins[agKey];
      const pList = agBin.participants;
      if (!pList || pList.length === 0) return;

      // Step 2: Group by Belt Code with 1-Belt Difference Adjustment Rule
      // Sort exact belts in descending order (White Kyu 9, Orange 8, Yellow 7, Green 6, Blue 5, Purple 4, Brown 3, 2, 1, Black -1..-9)
      const exactBeltMap = {};
      pList.forEach(p => {
        const bCode = p.belt !== undefined ? p.belt : 9;
        if (!exactBeltMap[bCode]) exactBeltMap[bCode] = [];
        exactBeltMap[bCode].push(p);
      });

      const sortedBeltCodes = Object.keys(exactBeltMap).map(Number).sort((a, b) => b - a);

      // Build initial belt groups
      let beltGroups = sortedBeltCodes.map(bCode => ({
        beltCodes: [bCode],
        beltLabel: this.getBeltLabel(bCode),
        tierName: this.getBeltTier(bCode),
        participants: exactBeltMap[bCode]
      }));

      // Merge small groups (< 3 participants) with ADJACENT belt ranks ONLY (|b1 - b2| <= 1)
      let mergedBeltGroups = [];
      let i = 0;
      while (i < beltGroups.length) {
        let current = beltGroups[i];

        // If current group has < 3 participants, attempt to merge with adjacent belt rank in the list
        if (current.participants.length < 3 && i + 1 < beltGroups.length) {
          const next = beltGroups[i + 1];
          const bCurrentLast = current.beltCodes[current.beltCodes.length - 1];
          const bNextFirst = next.beltCodes[0];

          // Check if adjacent (1 belt up or 1 belt down: |bCurrent - bNext| <= 1)
          if (Math.abs(bCurrentLast - bNextFirst) <= 1) {
            current = {
              beltCodes: [...current.beltCodes, ...next.beltCodes],
              beltLabel: `${current.beltLabel} & ${next.beltLabel}`,
              tierName: current.tierName === next.tierName ? current.tierName : `${current.tierName}/${next.tierName}`,
              participants: [...current.participants, ...next.participants]
            };
            i++; // skip next since it's merged
          }
        } else if (current.participants.length < 3 && mergedBeltGroups.length > 0) {
          // If still < 3 and at end, check if can merge backward into previous group if adjacent
          const prev = mergedBeltGroups[mergedBeltGroups.length - 1];
          const bPrevLast = prev.beltCodes[prev.beltCodes.length - 1];
          const bCurrentFirst = current.beltCodes[0];

          if (Math.abs(bPrevLast - bCurrentFirst) <= 1) {
            prev.beltCodes.push(...current.beltCodes);
            prev.beltLabel += ` & ${current.beltLabel}`;
            prev.participants.push(...current.participants);
            i++;
            continue;
          }
        }

        mergedBeltGroups.push(current);
        i++;
      }

      // Track Kumite bout letter index per Age & Gender bin
      let kumiteBoutIndex = 0;

      // Step 3: For each merged belt group, generate Kumite & Kata bouts
      mergedBeltGroups.forEach(bGroup => {
        const pool = bGroup.participants;
        if (!pool || pool.length === 0) return;

        // Sort participants by schoolHours so school kids are prioritized if needed
        const schoolKids = pool.filter(p => p.schoolHours);
        const regularKids = pool.filter(p => !p.schoolHours);
        const orderedPool = [...schoolKids, ...regularKids];

        // Partition pool into Kumite bouts of size 4 to 8 participants (target max 8)
        const totalP = orderedPool.length;
        let numKumiteChunks = Math.ceil(totalP / 8);
        if (numKumiteChunks === 0) numKumiteChunks = 1;
        
        // Distribute participants into Kumite chunks as evenly as possible
        const kumiteChunks = [];
        const baseSize = Math.floor(totalP / numKumiteChunks);
        let remainder = totalP % numKumiteChunks;
        
        let pOffset = 0;
        for (let k = 0; k < numKumiteChunks; k++) {
          const chunkLen = baseSize + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder--;
          
          const chunkParticipants = orderedPool.slice(pOffset, pOffset + chunkLen);
          pOffset += chunkLen;
          if (chunkParticipants.length > 0) {
            kumiteChunks.push(chunkParticipants);
          }
        }

        // Process each Kumite chunk
        kumiteChunks.forEach(chunkParticipants => {
          const letter = getBoutLetter(kumiteBoutIndex);
          kumiteBoutIndex++;

          // Subdivide chunkParticipants into 2 or 3 Kata bouts of sizes 3..5 (max 5, min 3)
          const chunkSize = chunkParticipants.length;
          let numKataSubs = 1;
          if (chunkSize >= 6) {
            numKataSubs = 2; // e.g. 6->(3,3), 7->(4,3), 8->(4,4)
          } else if (chunkSize > 5) {
            numKataSubs = Math.ceil(chunkSize / 5);
          }

          // Distribute chunk participants across Kata sub-bouts with branch separation
          const kataSubLists = this.distributeParticipantsWithBranchSeparation(chunkParticipants, numKataSubs);

          const createdKataBouts = [];

          // 1. Create KATA bouts first
          if (eventMode === 'kata' || eventMode === 'both') {
            kataSubLists.forEach((subList, subIdx) => {
              if (!subList || subList.length === 0) return;
              const subNum = subIdx + 1;
              const boutCode = `${agBin.ageCat.toLowerCase().replace(/[^a-z0-9]/g, '')}_kata_${letter}${subNum}`;
              const boutName = `${agBin.ageCat} ${agBin.gender} Kata Bout ${letter}${subNum}`;

              const kataBout = {
                id: 'bout_kata_' + Math.random().toString(36).substr(2, 9),
                boutCode,
                boutName,
                eventType: 'Kata',
                ageCategory: agBin.ageCat,
                gender: agBin.gender,
                beltTier: bGroup.tierName,
                beltLabel: bGroup.beltLabel,
                participants: subList,
                status: 'Pending',
                tatamiId: null
              };
              bouts.push(kataBout);
              createdKataBouts.push(kataBout);
            });
          }

          // 2. Create KUMITE bout (merging participants from the corresponding Kata bouts)
          if (eventMode === 'kumite' || eventMode === 'both') {
            const boutCode = `${agBin.ageCat.toLowerCase().replace(/[^a-z0-9]/g, '')}_kumite_${letter}`;
            const boutName = `${agBin.ageCat} ${agBin.gender} Kumite Bout ${letter}`;

            // Combine all participants from the Kata sub-bouts for this letter
            const kumiteParticipants = createdKataBouts.length > 0
              ? createdKataBouts.flatMap(kb => kb.participants)
              : chunkParticipants;

            bouts.push({
              id: 'bout_kumite_' + Math.random().toString(36).substr(2, 9),
              boutCode,
              boutName,
              eventType: 'Kumite',
              ageCategory: agBin.ageCat,
              gender: agBin.gender,
              beltTier: bGroup.tierName,
              beltLabel: bGroup.beltLabel,
              participants: kumiteParticipants,
              status: 'Pending',
              tatamiId: null
            });
          }
        });
      });
    });

    // Final Sort: All KATA bouts first (sorted by age, gender, bout name), followed by all KUMITE bouts
    bouts.sort((a, b) => {
      if (a.eventType !== b.eventType) {
        return a.eventType === 'Kata' ? -1 : 1;
      }
      if (a.ageCategory !== b.ageCategory) return a.ageCategory.localeCompare(b.ageCategory);
      if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
      return (a.boutName || '').localeCompare(b.boutName || '');
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
