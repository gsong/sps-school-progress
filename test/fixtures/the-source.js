// Synthetic The Source pages: the real shapes (see docs/nav-the-source.md), invented values.
import { reply } from '../harness.js';

export const HOME_URL = 'https://ps.seattleschools.org/guardian/home.html';
export const STUDENT_ID = '12345'; // placeholder
export const TERM = { fg: 'Q1', begdate: '09/03/2026', enddate: '11/06/2026' };

const DAYS = ['M', 'T', 'W', 'H', 'F'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// A graded course. `assignments` are lookup items made with assignment().
export function course(name, percent, { letter = 'B', assignments = [] } = {}) {
  return { name, percent, letter, assignments };
}

// One lookup item, with scores nested under _assignmentsections[0] as the real API does.
export function assignment({ name = 'Item', due = '2026-10-05', entered, percent, missing = false, late = false }) {
  const score = { islate: late, ismissing: missing, isexempt: false, scorelettergrade: 'B', actualscorekind: 'REAL_SCORE' };
  if (entered) score.scoreentrydate = `${entered} 15:30:00`;
  if (percent != null) score.scorepercent = percent;
  return {
    _name: 'assignment',
    assignmentid: 1,
    _assignmentsections: [
      { _name: 'assignmentsection', name, duedate: due, totalpointvalue: 10, _assignmentscores: [score] },
    ],
  };
}

export function homeHtml(courses, { extraRows = '' } = {}) {
  const dayCells = '<td>&nbsp;</td>'.repeat(10);
  const rows = courses
    .map(
      (c, i) => `
    <tr class="center" id="ccid_${1000 + i}">
      <td>${i + 1}(A)</td>${dayCells}
      <td class="table-element-text-align-start">${c.name}&nbsp;<br><a href="mailto:teacher@example.com">Email Teacher, A</a>&nbsp;<span class="display-flex"><span>-&nbsp;Rm:</span><span>&nbsp;100</span></span></td>
      <td class="colorMyGrade"><a href="scores.html?frn=0040000000${i}&begdate=${TERM.begdate}&enddate=${TERM.enddate}&fg=${TERM.fg}&schoolid=100" class="bold">${c.letter}<br>${c.percent}</a></td>
      <td class="colorMyGrade"><a href="scores.html?frn=0040000000${i}&fg=Q2&schoolid=100">[ i ]</a></td>
      <td class="colorMyGrade"><a href="scores.html?frn=0040000000${i}&begdate=${TERM.begdate}&enddate=01/28/2027&fg=S1&schoolid=100" class="bold">${c.letter}<br>${c.percent}</a></td>
      <td class="notInSession">&nbsp;<span class="screen_readers_only">Not available</span></td>
      <td class="notInSession">&nbsp;<span class="screen_readers_only">Not available</span></td>
      <td class="notInSession">&nbsp;<span class="screen_readers_only">Not available</span></td>
      <td>0</td><td>0</td>
    </tr>`,
    )
    .join('');
  return `
  <table id="tblgrades">
    <tr class="center th2"><th rowspan="2">Exp</th><th colspan="5">Last Week</th><th colspan="5">This Week</th><th rowspan="2">Course</th><th rowspan="2">Q1</th><th rowspan="2">Q2</th><th rowspan="2">S1</th><th rowspan="2">Q3</th><th rowspan="2">Q4</th><th rowspan="2">S2</th><th rowspan="2">Absences</th><th rowspan="2">Tardies</th></tr>
    <tr class="center th2">${DAYS.map((d) => `<th>${d}</th>`).join('')}${DAYS.map((d) => `<th>${d}</th>`).join('')}</tr>
    ${rows}${extraRows}
    <tr><td id="attTotal" colspan="18"></td>
      <td id="termAbsTotal"><a href="attendancedatesall.html?frn=001${STUDENT_ID}&codes=*abs&term=S1">0</a></td>
      <td id="termTarTotal"><a href="attendancedatesall.html?frn=001${STUDENT_ID}&codes=*tar&term=S1">0</a></td></tr>
  </table>`;
}

// A counselor row (no grade) and an advisory row (pass grade).
export const UNGRADED_ROWS = `
  <tr class="center" id="ccid_9001"><td>CO(A)</td>${'<td>.</td>'.repeat(10)}
    <td class="table-element-text-align-start">Counselor Row&nbsp;<br></td>
    <td class="colorMyGrade"><a href="scores.html?frn=00499999991&fg=Q1&schoolid=100">[ i ]</a></td></tr>
  <tr class="center" id="ccid_9002"><td>HR(A)</td>${'<td>&nbsp;</td>'.repeat(10)}
    <td class="table-element-text-align-start">Advisory Row&nbsp;<br></td>
    <td class="colorMyGrade"><a href="scores.html?frn=00499999992&begdate=${TERM.begdate}&enddate=${TERM.enddate}&fg=Q1&schoolid=100" class="bold">P<br>100</a></td></tr>`;

// The attendance grid: Monday-start weeks from `first` (a Monday) for `weeks` weeks,
// split into two blocks like the real page. `codes` maps course -> { 'yyyy-mm-dd': code }.
export function attendanceHtml(codes, { first = '2026-09-14', weeks = 6 } = {}) {
  const dates = [];
  const [y, m, d] = first.split('-').map(Number);
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 5; i++) dates.push(new Date(y, m - 1, d + w * 7 + i));
  }
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const title = (dt) => `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${String(dt.getDate()).padStart(2, '0')}, ${dt.getFullYear()}`;
  const half = Math.ceil(weeks / 2) * 5;
  const block = (blockDates) => `
    <tr><th rowspan="2">Course</th><th rowspan="2">Expression</th>${'<th colspan="5">w</th>'.repeat(blockDates.length / 5)}</tr>
    <tr>${blockDates.map((dt, i) => `<th title="${title(dt)}">${DAYS[i % 5]}</th>`).join('')}</tr>
    ${Object.entries(codes)
      .map(
        ([course, byDate], i) => `
    <tr><td class="table-element-text-align-start">${course}<br>Teacher, A&nbsp;100<br>E:&nbsp;09/03/2026 L:&nbsp;06/18/2027</td><td>${i + 1}(A)</td>${blockDates
          .map((dt) => `<td>${byDate[iso(dt)] || '&nbsp;'}</td>`)
          .join('')}</tr>`,
      )
      .join('')}`;
  return `<html><head><title>Attendance</title></head><body><table class="grid">${block(dates.slice(0, half))}${block(dates.slice(half))}</table></body></html>`;
}

export function teacherCommentsHtml(comments = []) {
  const rows = comments
    .map(
      (c, i) =>
        `<tr><td>${i + 1}(A)</td><td>XX${1000 + i}</td><td>${c.course}</td><td><a href="mailto:teacher@example.com">Email Teacher, A</a></td><td><pre>${c.text}</pre></td></tr>`,
    )
    .join('');
  return `<html><head><title>Teacher Comments</title></head><body><table class="grid linkDescList"><tr><th>Exp.</th><th>Course #</th><th>Course</th><th>Teacher</th><th>Comment</th></tr>${rows}</table></body></html>`;
}

// `rows` are { month: 'yyyy-mm', course, letter }.
export function termGradesHtml(rows = []) {
  const body = rows
    .map(
      (r) =>
        `<tr><td class="dt-center" data-sort="${r.month}-20 00:00:00">${r.month.slice(5)}/${r.month.slice(0, 4)}</td><td class="dt-center">7</td><td>Some School</td><td class="dt-center">XX1000</td><td>${r.course}</td><td class="dt-center"> 0.500</td><td class="dt-center"> 0.500</td><td class="dt-center">${r.letter} <b></b></td></tr>`,
    )
    .join('');
  return `<html><head><title>Grade History</title></head><body><table id="grades-tbl"><thead><tr><th>Date Compl</th><th>Grade Level</th><th>School</th><th>Course #</th><th>Course</th><th>Credit Earned</th><th>Credit Attempted</th><th>Grade</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}

// Stub routes for a whole signed-in Check of `courses`.
export function routes(courses, { attendance = {}, comments = [], history = [], lookup } = {}) {
  return [
    { match: '/guardian/scores.html', respond: (path) => reply(`<div data-sectionid="${7000 + sectionIndex(path)}"></div>`) },
    {
      match: '/ws/xte/assignment/lookup',
      respond: (path, init) => {
        const sectionId = JSON.parse(init.body).section_ids[0];
        if (lookup) return lookup(sectionId);
        return reply(courses[sectionId - 7000].assignments);
      },
    },
    { match: '/guardian/attendance.html', respond: () => reply(attendanceHtml(attendance)) },
    { match: '/guardian/teachercomments.html', respond: () => reply(teacherCommentsHtml(comments)) },
    { match: '/guardian/termgrades.html', respond: () => reply(termGradesHtml(history)) },
  ];
}

function sectionIndex(path) {
  return Number(new URLSearchParams(path.split('?')[1]).get('frn').slice(-1));
}
