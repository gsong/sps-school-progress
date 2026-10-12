// Runs inside The Source's page via the browser's JavaScript tool, on
// https://ps.seattleschools.org/guardian/home.html. Run the whole file unchanged.
// It returns one JSON string; see docs/nav-the-source.md for every route used.
(async () => {
  // Flag thresholds (CONTEXT.md).
  const GRADE_RED_BELOW = 70;
  const GRADE_YELLOW_BELOW = 83;
  const LOW_SCORE_BELOW = 60;
  const HIGH_SCORE_FROM = 90;
  const WINDOW_DAYS = 14; // today and the 13 days before it
  const PILING_UP_DAYS = 3;
  const UNEXCUSED_CODES = ['UA', 'VU', 'UL', 'LU', 'A'];
  const TARDY_CODES = ['L', 'EL', 'LB']; // UL is unexcused, so it counts as Red only
  const EXCUSED_ABSENCE_CODES = ['AA', 'EA', 'FE', 'ME', 'QE', 'SS'];

  const SITE = 'the-source';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  try {
    return JSON.stringify(await check());
  } catch (e) {
    if (e && e.status) return JSON.stringify({ site: SITE, ...e });
    return JSON.stringify({ site: SITE, status: 'site-changed', reason: `exception: ${e && e.message}` });
  }

  // --- the Check ---

  async function check() {
    if (location.pathname === '/public/home.html') throw { status: 'signed-out' };
    if (location.pathname !== '/guardian/home.html' || document.title !== 'Grades') {
      throw siteChanged('the Grades page at /guardian/home.html');
    }
    const today = localDay(new Date());
    if (!document.querySelector('#tblgrades')) throw siteChanged('#tblgrades on the Grades page');
    const courses = parseHomeCourses(document, today);
    const studentId = (document.documentElement.innerHTML.match(/attendancedatesall\.html\?frn=001(\d+)/) || [])[1];
    if (!studentId) throw siteChanged('the attendancedatesall.html?frn=001 link on the Grades page');
    const term = courses[0] ? courses[0].term : null;

    const [assignments, attendanceHtml, commentsHtml, historyHtml] = await Promise.all([
      Promise.all(courses.map((c) => fetchAssignments(c, studentId))),
      getText('/guardian/attendance.html'),
      term ? getText(`/guardian/teachercomments.html?fg=${term}`) : '',
      getText('/guardian/termgrades.html'),
    ]);
    courses.forEach((c, i) => (c.assignments = assignments[i]));

    const days = parseAttendance(parseHtml(attendanceHtml), today);
    const flags = applyFlagRules(courses, days, today);
    return {
      site: SITE,
      status: 'ok',
      term,
      courses: courses.map((c) => ({
        name: c.name,
        letter: c.letter,
        percent: c.percent,
        recentScores: c.assignments
          .filter((a) => a.percent != null && !a.missing)
          .map((a) => ({ date: a.due, percent: a.percent })),
      })),
      ...flags,
      teacherComments: term ? parseTeacherComments(parseHtml(commentsHtml)) : [],
      gradeHistory: parseGradeHistory(parseHtml(historyHtml)),
    };
  }

  async function fetchAssignments(course, studentId) {
    const scoresHtml = await getText(`/guardian/${course.href}`);
    const sectionId = (scoresHtml.match(/data-sectionid="(\d+)"/) || [])[1];
    if (!sectionId) throw siteChanged(`data-sectionid on the scores page for ${course.name}`);
    // One section per call: the lookup drops items when given several.
    const res = await fetch(`/ws/xte/assignment/lookup?_=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section_ids: [Number(sectionId)],
        student_ids: [Number(studentId)],
        start_date: isoFromUs(course.begdate),
        end_date: isoFromUs(course.enddate),
      }),
    });
    if (res.status === 401) throw { status: 'signed-out' };
    if (!res.ok) throw siteChanged(`a 200 from the assignment lookup, got ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items)) throw siteChanged('an array from the assignment lookup');
    return items.map(parseAssignment);
  }

  async function getText(path) {
    const res = await fetch(path);
    if (res.status === 401 || (res.redirected && !new URL(res.url).pathname.startsWith('/guardian/'))) {
      throw { status: 'signed-out' };
    }
    if (!res.ok) throw siteChanged(`a 200 from ${path.split('?')[0]}, got ${res.status}`);
    return res.text();
  }

  // --- parsing (pure) ---

  function parseHomeCourses(doc, today) {
    const courses = [];
    for (const row of doc.querySelectorAll('#tblgrades tr[id^="ccid_"]')) {
      const link = currentTermLink(row, today);
      if (!link) continue; // counselor, library and support rows have no grade
      const [letter, percentText] = [...link.childNodes].map((n) => n.textContent.trim()).filter(Boolean);
      const percent = Number(percentText);
      if (!letter || percentText == null || Number.isNaN(percent) || letter === 'P') continue; // advisory pass
      const nameCell = row.querySelector('td.table-element-text-align-start');
      const params = new URLSearchParams(link.getAttribute('href').split('?')[1]);
      courses.push({
        name: nameCell ? nameCell.childNodes[0].textContent.replace(/ /g, ' ').trim() : '',
        letter,
        percent,
        term: params.get('fg'),
        begdate: params.get('begdate'),
        enddate: params.get('enddate'),
        href: link.getAttribute('href'),
      });
    }
    return courses;
  }

  // The current quarter is the latest quarter link with dates that has begun.
  function currentTermLink(row, today) {
    let best = null;
    for (const a of row.querySelectorAll('a[href^="scores.html"]')) {
      const p = new URLSearchParams(a.getAttribute('href').split('?')[1]);
      if (!/^Q\d$/.test(p.get('fg') || '') || !p.get('begdate')) continue;
      const begins = isoFromUs(p.get('begdate'));
      if (begins > today) continue;
      if (!best || begins > best.begins) best = { a, begins };
    }
    return best && best.a;
  }

  function parseAssignment(item) {
    const section = (item._assignmentsections || [])[0] || {};
    // Scores sit under _assignmentsections[0], not at the top level.
    const score = (section._assignmentscores || [])[0] || {};
    return {
      name: section.name || item._name || '',
      due: section.duedate || '',
      entered: (score.scoreentrydate || '').slice(0, 10),
      percent: typeof score.scorepercent === 'number' ? round1(score.scorepercent) : null,
      missing: score.ismissing === true,
      late: score.islate === true,
    };
  }

  // Map of 'yyyy-mm-dd' -> Set of codes, for school days in the 14-day window.
  // One sick day shows in every class row; it is still one day.
  function parseAttendance(doc, today) {
    const grid = doc.querySelector('table.grid');
    if (!grid) throw siteChanged('table.grid on attendance.html');
    const from = addDays(today, 1 - WINDOW_DAYS);
    const days = new Map();
    let dates = [];
    for (const row of grid.querySelectorAll('tr')) {
      const titled = [...row.querySelectorAll('th[title]')];
      if (titled.length) {
        dates = titled.map((th) => dayFromTitle(th.getAttribute('title')));
        continue;
      }
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 3) continue;
      cells.slice(2).forEach((cell, i) => {
        const date = dates[i];
        const code = cell.textContent.trim();
        if (!date || date < from || date > today || !code || code === '.' || code === '-') return;
        if (!days.has(date)) days.set(date, new Set());
        days.get(date).add(code);
      });
    }
    return days;
  }

  function parseTeacherComments(doc) {
    const table = doc.querySelector('table.grid');
    if (!table) throw siteChanged('table.grid on teachercomments.html');
    const comments = [];
    for (const row of table.querySelectorAll('tr')) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) continue;
      const text = cells[cells.length - 1].textContent.trim();
      if (text) comments.push({ course: cells[2].textContent.trim(), text });
    }
    return comments;
  }

  // Letters from the last two completed semesters. Claude matches courses by name.
  function parseGradeHistory(doc) {
    const table = doc.querySelector('#grades-tbl');
    if (!table) throw siteChanged('#grades-tbl on termgrades.html');
    const rows = [...table.querySelectorAll('tbody tr, tr')]
      .map((r) => r.querySelectorAll('td'))
      .filter((cells) => cells.length >= 8)
      .map((cells) => ({
        month: (cells[0].getAttribute('data-sort') || '').slice(0, 7),
        course: cells[4].textContent.trim(),
        letter: cells[7].textContent.trim(),
      }));
    const months = [...new Set(rows.map((r) => r.month))].filter(Boolean).sort().slice(-2);
    const seen = new Set();
    return rows
      .filter((r) => months.includes(r.month))
      .filter((r) => !seen.has(r.month + r.course) && seen.add(r.month + r.course))
      .map((r) => ({ course: r.course, term: semesterName(r.month), letter: r.letter }));
  }

  // --- flag rules (pure) ---

  function applyFlagRules(courses, days, today) {
    const from = addDays(today, 1 - WINDOW_DAYS);
    const inWindow = (date) => !!date && date >= from && date <= today;
    const redFlags = [];
    const yellowFlags = [];
    const brightSpots = [];

    for (const c of courses) {
      if (c.percent < GRADE_RED_BELOW) {
        redFlags.push({ rule: 'grade-below-70', course: c.name, value: `${c.percent}%` });
      } else if (c.percent < GRADE_YELLOW_BELOW) {
        yellowFlags.push({ rule: 'grade-70-to-83', course: c.name, value: `${c.percent}%` });
      }
      for (const a of c.assignments) {
        const item = { course: c.name, item: a.name };
        if (a.missing) {
          // A missing item auto-scores near 50%; it counts once, as missing.
          redFlags.push({ rule: 'missing', ...item, date: a.due });
        } else if (a.percent != null && a.percent < LOW_SCORE_BELOW && inWindow(a.entered)) {
          redFlags.push({ rule: 'low-score', ...item, date: a.entered, value: `${a.percent}%` });
        }
        if (a.late && (inWindow(a.entered) || inWindow(a.due))) {
          yellowFlags.push({ rule: 'late', ...item, date: a.due });
        }
        if (!a.missing && a.percent != null && a.percent >= HIGH_SCORE_FROM && inWindow(a.entered)) {
          brightSpots.push({ rule: 'high-score', ...item, date: a.entered, value: `${a.percent}%` });
        }
      }
    }

    const dated = [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    for (const [date, codes] of dated) {
      const unexcused = [...codes].filter((c) => UNEXCUSED_CODES.includes(c));
      if (unexcused.length) redFlags.push({ rule: 'unexcused-absence', date, value: unexcused.join(' ') });
    }
    const daysWith = (list) => dated.filter(([, codes]) => [...codes].some((c) => list.includes(c))).map(([d]) => d);
    const tardyDays = daysWith(TARDY_CODES);
    if (tardyDays.length >= PILING_UP_DAYS) {
      yellowFlags.push({ rule: 'tardies-piling-up', date: tardyDays.join(', '), value: `${tardyDays.length} days` });
    }
    const excusedDays = daysWith(EXCUSED_ABSENCE_CODES);
    if (excusedDays.length >= PILING_UP_DAYS) {
      yellowFlags.push({
        rule: 'excused-absences-piling-up',
        date: excusedDays.join(', '),
        value: `${excusedDays.length} days`,
      });
    }
    return { redFlags, yellowFlags, brightSpots };
  }

  // --- helpers (pure) ---

  function siteChanged(expected) {
    return { status: 'site-changed', reason: `expected ${expected}` };
  }

  function parseHtml(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  // 'Mon, Oct 05, 2026' (optionally followed by ' : Not in session') -> '2026-10-05'
  function dayFromTitle(title) {
    const m = (title || '').match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
    if (!m || !MONTHS.includes(m[1])) return null;
    return `${m[3]}-${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(m[2])}`;
  }

  // '9/3/2026' -> '2026-09-03'
  function isoFromUs(us) {
    const [m, d, y] = us.split('/');
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  // '2026-01' -> 'S1 2025-26', '2026-06' -> 'S2 2025-26'
  function semesterName(month) {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return month;
    const start = m >= 9 ? y : y - 1;
    const half = m >= 9 || m <= 3 ? 'S1' : 'S2';
    return `${half} ${start}-${String(start + 1).slice(2)}`;
  }

  function localDay(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    return localDay(new Date(y, m - 1, d + n));
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }
})();
