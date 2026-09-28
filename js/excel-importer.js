/**
 * Excel Importer & Bout Grouping Engine for Shotokan Karate Championship
 * Robust Excel parsing with automatic header row detection & belt mapping
 */

const ExcelImporter = {
  // Normalize belt values to integer Kyu (9 to 1) or Dan (-1 to -9)
  parseBelt(beltValue) {
    if (beltValue === undefined || beltValue === null) return 9; // Default White
    const str = String(beltValue).trim().toLowerCase();
    
    // Direct numeric check
    const num = parseInt(str, 10);
    if (!isNaN(num) && num !== 0 && num >= -9 && num <= 9) {
      return num;
    }

    // String name mappings
    if (str.includes('white') || str.includes('kyu 9') || str.includes('9th kyu')) return 9;
    if (str.includes('orange') || str.includes('kyu 8') || str.includes('8th kyu')) return 8;
    if (str.includes('yellow') || str.includes('kyu 7') || str.includes('7th kyu')) return 7;
    if (str.includes('green') || str.includes('kyu 6') || str.includes('6th kyu')) return 6;
    if (str.includes('blue') || str.includes('kyu 5') || str.includes('5th kyu')) return 5;
    if (str.includes('purple') || str.includes('kyu 4') || str.includes('4th kyu')) return 4;
    if (str.includes('brown 3') || str.includes('3rd brown') || str.includes('kyu 3')) return 3;
    if (str.includes('brown 2') || str.includes('2nd brown') || str.includes('kyu 2')) return 2;
    if (str.includes('brown 1') || str.includes('1st brown') || str.includes('kyu 1')) return 1;
    if (str.includes('brown')) return 2;
    
    // Dan ranks (-1 to -9)
    if (str.includes('shodan') || str.includes('1st dan') || str.includes('black 1')) return -1;
    if (str.includes('nidan') || str.includes('2nd dan') || str.includes('black 2')) return -2;
    if (str.includes('sandan') || str.includes('3rd dan') || str.includes('black 3')) return -3;
    if (str.includes('yondan') || str.includes('4th dan') || str.includes('black 4')) return -4;
    if (str.includes('godan') || str.includes('5th dan') || str.includes('black 5')) return -5;
    if (str.includes('rokudan') || str.includes('6th dan') || str.includes('black 6')) return -6;
    if (str.includes('nanadan') || str.includes('7th dan') || str.includes('black 7')) return -7;
    if (str.includes('hachidan') || str.includes('8th dan') || str.includes('black 8')) return -8;
    if (str.includes('kudan') || str.includes('9th dan') || str.includes('black 9')) return -9;
    if (str.includes('black')) return -1;

    return 9; // Default fallback
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

  // Read Excel File with Smart Header Row Detection
  parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            return reject(new Error('Excel file has no sheets!'));
          }

          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // 1. Convert sheet to array of arrays to find header row index
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          if (!rawRows || rawRows.length === 0) {
            return reject(new Error('Excel sheet is empty!'));
          }

          let headerRowIndex = 0;
          for (let r = 0; r < Math.min(10, rawRows.length); r++) {
            const rowArr = rawRows[r];
            if (Array.isArray(rowArr)) {
              const hasHeaderMatch = rowArr.some(cell => {
                const s = String(cell || '').toLowerCase();
                return s.includes('name') || s.includes('participant') || s.includes('athlete') || s.includes('belt') || s.includes('dojo') || s.includes('branch');
              });
              if (hasHeaderMatch) {
                headerRowIndex = r;
                break;
              }
            }
          }

          // 2. Parse starting from detected header row
          const jsonRows = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex, defval: '' });
          const validParticipants = [];

          jsonRows.forEach((row, index) => {
            if (!row || typeof row !== 'object') return;
            const keys = Object.keys(row);
            if (keys.length === 0) return;

            const findVal = (terms) => {
              const matchedKey = keys.find(k => {
                if (k === null || k === undefined) return false;
                const strK = String(k).toLowerCase();
                return terms.some(t => strK.includes(t.toLowerCase()));
              });
              return matchedKey !== undefined ? row[matchedKey] : '';
            };

            const rawName = String(findVal(['name', 'participant', 'athlete', 'student', 'player']) || '').trim();

            // Skip empty rows or header duplicates
            if (!rawName && keys.every(k => !row[k])) return;
            if (rawName.toLowerCase() === 'name' || rawName.toLowerCase() === 'participant name') return;

            const name = rawName || `Participant ${index + 1}`;
            const genderRaw = String(findVal(['gender', 'sex', 'm/f']) || 'Male').trim();
            const gender = genderRaw.toLowerCase().startsWith('f') ? 'Female' : 'Male';
            const ageRaw = parseInt(findVal(['age', 'years']), 10);
            const age = isNaN(ageRaw) ? 10 : ageRaw;
            const beltRaw = findVal(['belt', 'kyu', 'dan', 'grade', 'rank']);
            const belt = this.parseBelt(beltRaw);
            const branch = String(findVal(['branch', 'dojo', 'club', 'school']) || 'Main Branch').trim();
            const instructor = String(findVal(['instructor', 'sensei', 'coach']) || '').trim();
            const schoolHoursRaw = String(findVal(['school hours', 'school hour', 'school', 'sh'])).trim().toLowerCase();
            const schoolHours = schoolHoursRaw.startsWith('y') || schoolHoursRaw === 'true' || schoolHoursRaw === '1';

            validParticipants.push({
              id: 'p_' + Math.random().toString(36).substr(2, 9),
              name,
              gender,
              age,
              belt,
              beltLabel: this.getBeltLabel(belt),
              beltTier: this.getBeltTier(belt),
              branch,
              instructor,
              schoolHours
            });
          });

          resolve(validParticipants);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  },

  // Derive Age Category Name (e.g. U8, U10, U12, U14, U16, Senior)
  getAgeCategory(age) {
    if (age <= 8) return 'U8';
    if (age <= 10) return 'U10';
    if (age <= 12) return 'U12';
    if (age <= 14) return 'U14';
    if (age <= 16) return 'U16';
    if (age <= 18) return 'U18';
    return 'Senior';
  },

  // Auto-generate Bout Groups from Participant List
  generateBoutGroups(participants) {
    const categoryBins = {};

    participants.forEach(p => {
      const ageCat = this.getAgeCategory(p.age);
      const key = `${ageCat}_${p.gender}_${p.beltTier}`;
      if (!categoryBins[key]) {
        categoryBins[key] = {
          ageCat,
          gender: p.gender,
          beltTier: p.beltTier,
          list: []
        };
      }
      categoryBins[key].list.push(p);
    });

    const bouts = [];

    Object.keys(categoryBins).forEach(catKey => {
      const bin = categoryBins[catKey];
      const list = bin.list;
      const count = list.length;

      if (count === 0) return;

      const numGroups = Math.max(1, Math.ceil(count / 8));
      const groups = Array.from({ length: numGroups }, () => []);

      list.sort((a, b) => b.belt - a.belt);

      const schoolHourKids = list.filter(p => p.schoolHours);
      const regularKids = list.filter(p => !p.schoolHours);
      const combinedOrdered = [...schoolHourKids, ...regularKids];

      combinedOrdered.forEach((p, idx) => {
        const targetGroupIdx = idx % numGroups;
        groups[targetGroupIdx].push(p);
      });

      groups.forEach((groupParticipants, gIdx) => {
        const letter = String.fromCharCode(97 + gIdx); // 'a', 'b', 'c'...
        const boutCode = `${bin.ageCat}${letter}`.toLowerCase();
        const boutName = `${bin.ageCat}-${bin.gender}-${bin.beltTier} Group ${letter.toUpperCase()}`;

        bouts.push({
          id: 'bout_' + Math.random().toString(36).substr(2, 9),
          boutCode,
          boutName,
          ageCategory: bin.ageCat,
          gender: bin.gender,
          beltTier: bin.beltTier,
          participants: groupParticipants,
          status: 'Pending',
          tatamiId: null
        });
      });
    });

    return bouts;
  }
};

window.ExcelImporter = ExcelImporter;
