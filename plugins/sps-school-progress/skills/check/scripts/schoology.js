// Runs inside Schoology's page via the browser's JavaScript tool, on
// https://app.schoology.com/parent/home. Run the whole file unchanged.
// It returns one JSON string; see docs/nav-schoology.md for every route used.
(async () => {
  // Coming up windows, counted forward from today (CONTEXT.md).
  const NEAR_DAYS = 7; // assignments and events
  const FAR_DAYS = 14; // tests, quizzes (assessments) and projects

  const SITE = 'schoology';

  try {
    return JSON.stringify(await check());
  } catch (e) {
    if (e && e.status) return JSON.stringify({ site: SITE, ...e });
    return JSON.stringify({ site: SITE, status: 'site-changed', reason: `exception: ${e && e.message}` });
  }

  // --- the Check ---

  async function check() {
    if (location.pathname === '/login') throw { status: 'signed-out' };
    if (location.pathname !== '/parent/home' || document.title !== 'Summary | Schoology') {
      throw siteChanged('the parent home page at /parent/home');
    }
    const today = localDay(new Date());

    const info = await getJson('/iapi/parent/info');
    const children = info && info.body && info.body.children;
    if (!children || typeof children !== 'object') throw siteChanged('body.children from /iapi/parent/info');
    const kids = Object.values(children);
    if (kids.length > 1) throw { status: 'site-changed', reason: 'more than one student' };
    if (!kids.length || !kids[0].uid) throw siteChanged('one student in /iapi/parent/info');
    const uid = String(kids[0].uid);

    const start = epochSeconds(today);
    const end = epochSeconds(addDays(today, FAR_DAYS + 1));
    const [events, overdue] = await Promise.all([
      getJson(`/parent/calendar?ajax=1&start=${start}&end=${end}`),
      getJson(`/iapi/parent/overdue_submissions/${uid}`),
    ]);
    if (!Array.isArray(events)) throw siteChanged('an array from the calendar feed');
    const overdueHtml = overdue && overdue.body && overdue.body.html;
    if (typeof overdueHtml !== 'string') throw siteChanged('body.html from the overdue submissions feed');

    return {
      site: SITE,
      status: 'ok',
      comingUp: parseComingUp(events, uid, today),
      overdue: parseOverdue(overdueHtml, today),
    };
  }

  async function getJson(path) {
    const res = await fetch(path);
    // Signed out, Schoology redirects to /login and answers 200 with HTML.
    if (res.redirected && new URL(res.url).pathname.startsWith('/login')) throw { status: 'signed-out' };
    if (!res.ok) throw siteChanged(`a 200 from ${path.split('?')[0]}, got ${res.status}`);
    if (!(res.headers.get('content-type') || '').includes('json')) {
      throw siteChanged(`JSON from ${path.split('?')[0]}`);
    }
    return res.json();
  }

  // --- parsing (pure) ---

  function parseComingUp(events, uid, today) {
    const items = [];
    for (const e of events) {
      if (e.child_uid != null && String(e.child_uid) !== uid) continue;
      const date = String(e.start || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw siteChanged('a yyyy-mm-dd start on each calendar item');
      const type = ['assignment', 'assessment'].includes(e.e_type) ? e.e_type : 'event';
      const title = textOf(e.titleText || e.title).replace(/\s*-\s*DUE \d{1,2}\/\d{1,2}\s*$/, '');
      const far = type === 'assessment' || /project/i.test(title);
      const ahead = daysBetween(today, date);
      if (ahead < 0 || ahead > (far ? FAR_DAYS : NEAR_DAYS)) continue;
      items.push({ type, course: courseName(e.content_title), title, date });
    }
    return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  // The feed also lists items not yet due, so keep only those due before today.
  function parseOverdue(html, today) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = [];
    for (const el of doc.querySelectorAll('.upcoming-event')) {
      const startSec = Number(el.getAttribute('data-start'));
      if (!startSec) throw siteChanged('data-start on each overdue item');
      const dueDate = localDay(new Date(startSec * 1000));
      if (dueDate >= today) continue;
      const link = el.querySelector('.event-title a');
      const course = el.querySelector('.realm-title-course');
      items.push({
        course: courseName(course ? course.textContent : ''),
        title: (link ? link.textContent : '').trim().replace(/\s*-\s*DUE \d{1,2}\/\d{1,2}\s*$/, ''),
        dueDate,
      });
    }
    return items;
  }

  // --- helpers (pure) ---

  function siteChanged(expected) {
    return { status: 'site-changed', reason: `expected ${expected}` };
  }

  // 'Course A: S1 2(A) 3' -> 'Course A'
  function courseName(title) {
    return String(title || '').split(':')[0].trim();
  }

  // Strips tags and decodes entities such as &#039;.
  function textOf(html) {
    return new DOMParser().parseFromString(String(html || ''), 'text/html').body.textContent.trim();
  }

  function localDay(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function addDays(day, n) {
    const [y, m, d] = day.split('-').map(Number);
    return localDay(new Date(y, m - 1, d + n));
  }

  function daysBetween(from, to) {
    const [a, b] = [from, to].map((s) => s.split('-').map(Number)).map(([y, m, d]) => Date.UTC(y, m - 1, d));
    return Math.round((b - a) / 86400000);
  }

  function epochSeconds(day) {
    const [y, m, d] = day.split('-').map(Number);
    return Math.floor(new Date(y, m - 1, d).getTime() / 1000);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }
})();
