import { describe, expect, it } from 'vitest';
import { reply, runScript } from './harness.js';
import { CHILD_UID, HOME_URL, calendarItem, parentInfo, routes } from './fixtures/schoology.js';

// Wednesday 2026-10-14. Near items count through 2026-10-21, far items through 2026-10-28.
const NOW = new Date(2026, 9, 14, 10, 0);

function check(options = {}) {
  return runScript('schoology.js', {
    url: HOME_URL,
    title: 'Summary | Schoology',
    routes: options.routes || routes(options),
    now: NOW,
  });
}

describe('schoology.js: Coming up', () => {
  it('returns ok with trimmed items, sorted by date', async () => {
    const { result } = await check({
      events: [
        calendarItem({ type: 'assessment', title: 'Quiz 1', date: '2026-10-20' }),
        calendarItem({ title: "Reader's notes", date: '2026-10-15', course: 'Course B' }),
      ],
    });
    expect(result).toEqual({
      site: 'schoology',
      status: 'ok',
      comingUp: [
        { type: 'assignment', course: 'Course B', title: "Reader's notes", date: '2026-10-15' },
        { type: 'assessment', course: 'Course A', title: 'Quiz 1', date: '2026-10-20' },
      ],
      overdue: [],
    });
  });

  it.each([
    ['assignment', 'Item', '2026-10-21', true],
    ['assignment', 'Item', '2026-10-22', false],
    ['event', 'Event', '2026-10-21', true],
    ['event', 'Event', '2026-10-22', false],
    ['assessment', 'Test', '2026-10-28', true],
    ['assessment', 'Test', '2026-10-29', false],
    ['assignment', 'Science PROJECT', '2026-10-28', true],
    ['assignment', 'Science PROJECT', '2026-10-29', false],
  ])('a %s titled "%s" on %s is Coming up: %s', async (type, title, date, shown) => {
    const { result } = await check({ events: [calendarItem({ type, title, date, allDay: type === 'event' })] });
    expect(result.comingUp.length).toBe(shown ? 1 : 0);
  });

  it('includes items due today and drops items from before today', async () => {
    const { result } = await check({
      events: [calendarItem({ title: 'Today', date: '2026-10-14' }), calendarItem({ title: 'Yesterday', date: '2026-10-13' })],
    });
    expect(result.comingUp.map((i) => i.title)).toEqual(['Today']);
  });

  it('asks the calendar for today through 15 days ahead, in epoch seconds', async () => {
    const { calls } = await check();
    const params = new URLSearchParams(calls.find((c) => c.path.startsWith('/parent/calendar')).path.split('?')[1]);
    expect(Number(params.get('start'))).toBe(new Date(2026, 9, 14).getTime() / 1000);
    expect(Number(params.get('end'))).toBe(new Date(2026, 9, 29).getTime() / 1000);
  });
});

describe('schoology.js: overdue', () => {
  it('keeps items due before today and drops the not-yet-due item the feed also lists', async () => {
    const { result } = await check({
      overdue: [
        { title: 'Old item', course: 'Course A', due: new Date(2026, 9, 9, 23, 59) },
        { title: 'Not due yet', course: 'Course A', due: new Date(2026, 9, 16, 23, 59) },
        { title: 'Due today', course: 'Course A', due: new Date(2026, 9, 14, 23, 59) },
      ],
    });
    expect(result.overdue).toEqual([{ course: 'Course A', title: 'Old item', dueDate: '2026-10-09' }]);
  });

  it('asks for the one student by uid', async () => {
    const { calls } = await check();
    expect(calls.map((c) => c.path)).toContain(`/iapi/parent/overdue_submissions/${CHILD_UID}`);
  });
});

describe('schoology.js: signed out and site changes', () => {
  it('returns signed-out on the login page', async () => {
    const { result } = await runScript('schoology.js', {
      url: 'https://app.schoology.com/login?destination=parent/home',
      title: 'Log in to Schoology',
      now: NOW,
    });
    expect(result).toEqual({ site: 'schoology', status: 'signed-out' });
  });

  it('returns signed-out when a fetch is redirected to /login with HTML', async () => {
    const login = () => reply('<html>Log in</html>', { redirected: true, url: 'https://app.schoology.com/login?destination=x' });
    const { result } = await check({ routes: [{ match: '/iapi/parent/info', respond: login }, ...routes()] });
    expect(result).toEqual({ site: 'schoology', status: 'signed-out' });
  });

  it('returns site-changed for more than one student', async () => {
    const { result } = await check({ info: parentInfo([CHILD_UID, '999']) });
    expect(result).toEqual({ site: 'schoology', status: 'site-changed', reason: 'more than one student' });
  });

  it('returns site-changed when children is missing', async () => {
    const { result } = await check({ info: { response_code: 200, body: {} } });
    expect(result).toMatchObject({ status: 'site-changed', reason: expect.stringMatching(/children/) });
  });

  it('returns site-changed when the calendar returns HTML without a redirect', async () => {
    const { result } = await check({ routes: [{ match: '/parent/calendar', respond: () => reply('<html></html>') }, ...routes()] });
    expect(result).toMatchObject({ status: 'site-changed', reason: expect.stringMatching(/JSON/) });
  });

  it('returns site-changed on an unexpected page', async () => {
    const { result } = await runScript('schoology.js', { url: 'https://app.schoology.com/home', title: 'Home | Schoology', now: NOW });
    expect(result).toMatchObject({ status: 'site-changed', reason: expect.stringMatching(/parent home/) });
  });

  it('returns site-changed instead of throwing when fetch fails', async () => {
    const { result } = await check({ routes: [{ match: '/parent/calendar', respond: () => Promise.reject(new Error('offline')) }, ...routes()] });
    expect(result).toEqual({ site: 'schoology', status: 'site-changed', reason: 'exception: offline' });
  });
});
