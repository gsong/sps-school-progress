// Synthetic Schoology responses: the real shapes (see docs/nav-schoology.md), invented values.
import { reply } from '../harness.js';

export const HOME_URL = 'https://app.schoology.com/parent/home';
export const CHILD_UID = '12345'; // placeholder

export function parentInfo(uids = [CHILD_UID]) {
  const children = Object.fromEntries(
    uids.map((uid) => [uid, { uid, username: 'Student One', profile_url: `/user/${uid}`, recent_counts: {} }]),
  );
  return { response_code: 200, body: { children, session: { view_child: uids[0], view_mode: 'parent' } } };
}

// One calendar feed item. `date` is 'yyyy-mm-dd'.
export function calendarItem({ type = 'assignment', title = 'Item', date, course = 'Course A', allDay = false }) {
  const shown = type === 'assignment' ? `${title} - DUE ${date.slice(5, 7)}/${date.slice(8, 10)}` : title;
  return {
    id: '5000',
    title: type === 'event' ? shown : `<a href="/assignment/5000">${shown}</a>`,
    titleText: shown.replace(/'/g, '&#039;'),
    start: allDay ? `${date} 00:00:00` : `${date} 23:59:00`,
    end: '',
    allDay,
    e_type: type,
    realm: 'course',
    content_title: `${course}: S1 1(A) 1`,
    className: ['ev-course', type === 'assessment' ? 'assessment-icon' : 'assignment-icon', null],
    child_uid: CHILD_UID,
    child_name: 'Student One',
  };
}

// The overdue feed's HTML fragment. `items` are { title, course, due: Date }.
export function overdueHtml(items) {
  const blocks = items
    .map(
      (i) => `
    <div class="upcoming-event upcoming-event-block course-event" data-start="${Math.floor(i.due.getTime() / 1000)}">
      <div class="upcoming-item-content"><span class="infotip"><span class="mini-icon"><span class="visually-hidden">Assignment.</span></span>
        <span class="event-title"><a href="/assignment/6000">${i.title} - DUE ${String(i.due.getMonth() + 1).padStart(2, '0')}/${String(i.due.getDate()).padStart(2, '0')}</a>
          <span class="readonly-title event-subtitle">1 day overdue</span>
          <span class="infotip-content"><div class="realm-title-course-csl"><span class="realm-title-course">${i.course}: S1 1(A) 1</span></div></span>
        </span></span></div>
    </div>`,
    )
    .join('');
  return { response_code: 200, body: { html: `<div class="upcoming-events"><h3 class="submissions-title">Overdue</h3><div class="upcoming-list">${blocks}</div></div>` } };
}

export function routes({ info = parentInfo(), events = [], overdue = [] } = {}) {
  return [
    { match: '/iapi/parent/info', respond: () => reply(info) },
    { match: '/parent/calendar', respond: () => reply(events) },
    { match: '/iapi/parent/overdue_submissions/', respond: () => reply(overdueHtml(overdue)) },
  ];
}
