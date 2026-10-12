import { describe, expect, it } from 'vitest';
import { reply, runScript } from './harness.js';
import {
  HOME_URL,
  STUDENT_ID,
  UNGRADED_ROWS,
  assignment,
  course,
  homeHtml,
  routes,
} from './fixtures/the-source.js';

// Wednesday. The 14-day window is 2026-10-01 through 2026-10-14.
const NOW = new Date(2026, 9, 14, 10, 0);

function check(courses, options = {}) {
  return runScript('the-source.js', {
    url: HOME_URL,
    title: 'Grades',
    body: homeHtml(courses, options.home),
    routes: options.routes || routes(courses, options),
    now: NOW,
  });
}

const rules = (flags) => flags.map((f) => f.rule);

describe('the-source.js: course grades', () => {
  it('returns ok with the current term and each graded course', async () => {
    const { result } = await check([course('Course A', 91.5, { letter: 'A-' })]);
    expect(result).toMatchObject({ site: 'the-source', status: 'ok', term: 'Q1' });
    expect(result.courses).toEqual([{ name: 'Course A', letter: 'A-', percent: 91.5, recentScores: [] }]);
  });

  it('skips rows with no grade and the advisory pass grade', async () => {
    const { result } = await check([course('Course A', 90)], { home: { extraRows: UNGRADED_ROWS } });
    expect(result.courses.map((c) => c.name)).toEqual(['Course A']);
    expect(result.redFlags).toEqual([]);
  });

  it.each([
    [69.9, 'red', 'grade-below-70'],
    [70, 'yellow', 'grade-70-to-83'],
    [82.9, 'yellow', 'grade-70-to-83'],
    [83, null, null],
  ])('judges a course percent of %s by percent', async (percent, kind, rule) => {
    // The letter disagrees on purpose: grades are judged by percent, never by letter.
    const { result } = await check([course('Course A', percent, { letter: 'A' })]);
    const red = rules(result.redFlags);
    const yellow = rules(result.yellowFlags);
    expect(red.includes('grade-below-70')).toBe(kind === 'red');
    expect(yellow.includes('grade-70-to-83')).toBe(kind === 'yellow');
    if (rule) expect([...result.redFlags, ...result.yellowFlags][0]).toMatchObject({ rule, course: 'Course A', value: `${percent}%` });
  });

  it('never returns the student id', async () => {
    const { text } = await check([course('Course A', 90)]);
    expect(text).not.toContain(STUDENT_ID);
  });

  it('asks the lookup for one section per call, with the term dates', async () => {
    const { calls } = await check([course('Course A', 90), course('Course B', 90)]);
    const lookups = calls.filter((c) => c.path.startsWith('/ws/xte/assignment/lookup')).map((c) => JSON.parse(c.init.body));
    expect(lookups).toHaveLength(2);
    for (const body of lookups) {
      expect(body.section_ids).toHaveLength(1);
      expect(body).toMatchObject({ student_ids: [Number(STUDENT_ID)], start_date: '2026-09-03', end_date: '2026-11-06' });
    }
  });
});

describe('the-source.js: assignments', () => {
  it('reads scores from _assignmentsections[0]._assignmentscores[0], not the top level', async () => {
    const item = assignment({ name: 'Item 1', due: '2026-10-05', entered: '2026-10-06', percent: 95 });
    item.scorepercent = 10; // a decoy at the top level
    const { result } = await check([course('Course A', 90, { assignments: [item] })]);
    expect(result.courses[0].recentScores).toEqual([{ date: '2026-10-05', percent: 95 }]);
    expect(rules(result.brightSpots)).toEqual(['high-score']);
    expect(rules(result.redFlags)).toEqual([]);
  });

  it('flags a missing item from any date this term', async () => {
    const items = [assignment({ name: 'Item 1', due: '2026-09-08', missing: true })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(result.redFlags).toEqual([{ rule: 'missing', course: 'Course A', item: 'Item 1', date: '2026-09-08' }]);
  });

  it('counts a missing item that auto-scores near 50% once, as missing', async () => {
    const items = [assignment({ name: 'Item 1', due: '2026-10-05', entered: '2026-10-06', percent: 50, missing: true })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(rules(result.redFlags)).toEqual(['missing']);
    expect(result.courses[0].recentScores).toEqual([]);
  });

  it.each([
    [59.9, true],
    [60, false],
  ])('treats a score of %s entered in the window as low: %s', async (percent, low) => {
    const items = [assignment({ name: 'Item 1', entered: '2026-10-06', percent })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(rules(result.redFlags).includes('low-score')).toBe(low);
  });

  it.each([
    [89.9, false],
    [90, true],
  ])('treats a score of %s entered in the window as a Bright spot: %s', async (percent, bright) => {
    const items = [assignment({ name: 'Item 1', entered: '2026-10-06', percent })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(rules(result.brightSpots).includes('high-score')).toBe(bright);
  });

  it.each([
    ['2026-09-30', false],
    ['2026-10-01', true],
    ['2026-10-14', true],
  ])('uses the score entry date for the 14-day window: entered %s counts %s', async (entered, counts) => {
    const items = [
      assignment({ name: 'Low', entered, percent: 40 }),
      assignment({ name: 'High', entered, percent: 98 }),
    ];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(rules(result.redFlags).includes('low-score')).toBe(counts);
    expect(rules(result.brightSpots).includes('high-score')).toBe(counts);
  });

  it('never treats an unscored item as a low score', async () => {
    const items = [assignment({ name: 'Item 1', entered: '2026-10-06' })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(result.redFlags).toEqual([]);
    expect(result.courses[0].recentScores).toEqual([]);
  });

  // Late markers never appeared in the live test data.
  it('flags a late item entered in the window (unseen live)', async () => {
    const items = [assignment({ name: 'Item 1', due: '2026-09-20', entered: '2026-10-02', percent: 85, late: true })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(result.yellowFlags).toEqual([{ rule: 'late', course: 'Course A', item: 'Item 1', date: '2026-09-20' }]);
  });

  it('flags a late item due in the window with no entry date (unseen live)', async () => {
    const items = [assignment({ name: 'Item 1', due: '2026-10-09', late: true })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(rules(result.yellowFlags)).toEqual(['late']);
  });

  it('ignores a late item from before the window (unseen live)', async () => {
    const items = [assignment({ name: 'Item 1', due: '2026-09-20', entered: '2026-09-25', percent: 85, late: true })];
    const { result } = await check([course('Course A', 90, { assignments: items })]);
    expect(result.yellowFlags).toEqual([]);
  });
});

describe('the-source.js: attendance', () => {
  const two = [course('Course A', 90), course('Course B', 90)];

  // Unexcused codes never appeared in the live test data.
  it.each(['UA', 'VU', 'UL', 'LU', 'A'])('flags a %s code in the window as an unexcused absence (unseen live)', async (code) => {
    const { result } = await check(two, { attendance: { 'Course A': { '2026-10-06': code } } });
    expect(result.redFlags).toEqual([{ rule: 'unexcused-absence', date: '2026-10-06', value: code }]);
  });

  it('flags one unexcused day once, even when every class shows it (unseen live)', async () => {
    const day = { '2026-10-06': 'UA' };
    const { result } = await check(two, { attendance: { 'Course A': day, 'Course B': day } });
    expect(rules(result.redFlags)).toEqual(['unexcused-absence']);
  });

  it.each([
    ['2026-09-30', false],
    ['2026-10-01', true],
  ])('uses the 14-day window for attendance: a UA on %s counts %s (unseen live)', async (date, counts) => {
    const { result } = await check(two, { attendance: { 'Course A': { [date]: 'UA' } } });
    expect(rules(result.redFlags).includes('unexcused-absence')).toBe(counts);
  });

  it('reads dates from the second block of the grid', async () => {
    // The fixture's second block starts on 2026-10-05.
    const { result } = await check(two, { attendance: { 'Course A': { '2026-10-13': 'UA' } } });
    expect(result.redFlags).toEqual([{ rule: 'unexcused-absence', date: '2026-10-13', value: 'UA' }]);
  });

  it('counts school days, not class periods: one sick day in every class is one day', async () => {
    const sick = { '2026-10-02': 'ME', '2026-10-06': 'ME' };
    const { result } = await check(two, { attendance: { 'Course A': sick, 'Course B': sick } });
    expect(rules(result.yellowFlags)).toEqual([]);
  });

  it('flags excused absences on 3 school days', async () => {
    const { result } = await check(two, {
      attendance: { 'Course A': { '2026-10-02': 'ME', '2026-10-06': 'EA' }, 'Course B': { '2026-10-08': 'AA' } },
    });
    expect(result.yellowFlags).toEqual([
      { rule: 'excused-absences-piling-up', date: '2026-10-02, 2026-10-06, 2026-10-08', value: '3 days' },
    ]);
  });

  it('flags tardies on 3 school days', async () => {
    const { result } = await check(two, {
      attendance: { 'Course A': { '2026-10-02': 'L', '2026-10-06': 'EL' }, 'Course B': { '2026-10-08': 'LB' } },
    });
    expect(rules(result.yellowFlags)).toEqual(['tardies-piling-up']);
  });

  it('does not flag tardies on only 2 school days', async () => {
    const { result } = await check(two, { attendance: { 'Course A': { '2026-10-02': 'L', '2026-10-06': 'L' } } });
    expect(result.yellowFlags).toEqual([]);
  });

  it('treats UL as Red only, not as a tardy (unseen live)', async () => {
    const { result } = await check(two, {
      attendance: { 'Course A': { '2026-10-02': 'L', '2026-10-06': 'L', '2026-10-08': 'UL' } },
    });
    expect(rules(result.redFlags)).toEqual(['unexcused-absence']);
    expect(result.yellowFlags).toEqual([]);
  });

  it('ignores benign codes', async () => {
    const codes = { '2026-10-02': 'FT', '2026-10-06': 'IA', '2026-10-08': 'OA' };
    const { result } = await check(two, { attendance: { 'Course A': codes } });
    expect([...result.redFlags, ...result.yellowFlags]).toEqual([]);
  });
});

describe('the-source.js: comments and grade history', () => {
  it('keeps only non-empty teacher comments', async () => {
    const { result } = await check([course('Course A', 90)], {
      comments: [
        { course: 'Course A', text: 'Comment text.' },
        { course: 'Course B', text: '' },
      ],
    });
    expect(result.teacherComments).toEqual([{ course: 'Course A', text: 'Comment text.' }]);
  });

  it('keeps the last two semesters of grade history', async () => {
    const { result } = await check([course('Course A', 90)], {
      history: [
        { month: '2025-01', course: 'Course A', letter: 'C' },
        { month: '2026-01', course: 'Course A', letter: 'B' },
        { month: '2026-06', course: 'Course A', letter: 'A-' },
      ],
    });
    expect(result.gradeHistory).toEqual([
      { course: 'Course A', term: 'S1 2025-26', letter: 'B' },
      { course: 'Course A', term: 'S2 2025-26', letter: 'A-' },
    ]);
  });
});

describe('the-source.js: signed out and site changes', () => {
  it('returns signed-out on the login page', async () => {
    const { result } = await runScript('the-source.js', {
      url: 'https://ps.seattleschools.org/public/home.html',
      title: 'Parent, Guardian, and Student Login',
      now: NOW,
    });
    expect(result).toEqual({ site: 'the-source', status: 'signed-out' });
  });

  it('returns signed-out when the lookup answers 401 mid-Check', async () => {
    const courses = [course('Course A', 90)];
    const { result } = await check(courses, {
      routes: routes(courses, { lookup: () => reply({ message: 'Must be logged in' }, { status: 401 }) }),
    });
    expect(result).toEqual({ site: 'the-source', status: 'signed-out' });
  });

  it('returns signed-out when a page fetch is redirected outside /guardian/', async () => {
    const courses = [course('Course A', 90)];
    const signedOut = () => reply('<html>login</html>', { redirected: true, url: 'https://ps.seattleschools.org/my.policy' });
    const { result } = await check(courses, {
      routes: [{ match: '/guardian/attendance.html', respond: signedOut }, ...routes(courses)],
    });
    expect(result).toEqual({ site: 'the-source', status: 'signed-out' });
  });

  it('returns site-changed on an unexpected page', async () => {
    const { result } = await runScript('the-source.js', { url: HOME_URL, title: 'Something Else', now: NOW });
    expect(result).toMatchObject({ site: 'the-source', status: 'site-changed' });
    expect(result.reason).toMatch(/Grades/);
  });

  it('returns site-changed when the grades table is missing', async () => {
    const { result } = await runScript('the-source.js', { url: HOME_URL, title: 'Grades', body: '<p>nothing</p>', now: NOW });
    expect(result).toMatchObject({ status: 'site-changed', reason: expect.stringMatching(/#tblgrades/) });
  });

  it('returns site-changed when the lookup returns an unexpected shape', async () => {
    const courses = [course('Course A', 90)];
    const { result } = await check(courses, { routes: routes(courses, { lookup: () => reply({ items: [] }) }) });
    expect(result).toMatchObject({ status: 'site-changed', reason: expect.stringMatching(/array/) });
  });

  it('returns site-changed instead of throwing when fetch fails', async () => {
    const courses = [course('Course A', 90)];
    const { result } = await check(courses, {
      routes: [{ match: '/guardian/termgrades.html', respond: () => Promise.reject(new Error('network down')) }, ...routes(courses)],
    });
    expect(result).toEqual({ site: 'the-source', status: 'site-changed', reason: 'exception: network down' });
  });
});
