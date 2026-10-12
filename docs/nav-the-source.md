# Navigation map: The Source (PowerSchool parent portal)

Base: `https://ps.seattleschools.org/`. This guide is for a maintainer fixing `plugins/sps-school-progress/skills/check/scripts/the-source.js` after the site changes. The skill never loads it. It records structure only, never student data.

## What the script uses

The script runs in the page at `/guardian/home.html`. It reads these routes and fields, in this order.

1. **Page state.** Signed out, the path is `/public/home.html`. Signed in, the path is `/guardian/home.html` and `document.title` is `Grades`.
2. **Home page, `#tblgrades`.** One `tr[id^="ccid_"]` per course.
   - Course name: first child node of `td.table-element-text-align-start`.
   - Grade links: `a[href^="scores.html"]` in the row. The query string carries `fg` (`Q1` to `Q4`), `begdate` and `enddate` (`m/d/yyyy`).
   - Current term: the latest `Q<n>` link whose `begdate` has already passed.
   - Grade cell: the link's child nodes read `<letter>` then `<percent>`.
   - Rows without a letter and percent are skipped, as are rows with letter `P` (advisory pass).
3. **Student id.** In the home HTML, the regex `attendancedatesall\.html\?frn=001(\d+)` gives the student's digits.
4. **Per course, scores page.** `GET /guardian/<href of the current-term link>`. The regex `data-sectionid="(\d+)"` gives the section id.
5. **Per course, assignments.** `POST /ws/xte/assignment/lookup?_=<epoch ms>` with `Content-Type: application/json` and this body:
   `{"section_ids":[<sectionId>],"student_ids":[<studentId>],"start_date":"yyyy-mm-dd","end_date":"yyyy-mm-dd"}`
   - Send one section per call. Several sections return incomplete results.
   - Dates come from the link's `begdate` and `enddate`.
   - The response is an array. The script reads `_assignmentsections[0].name` (or `_name`) and `_assignmentsections[0].duedate`.
   - From `_assignmentsections[0]._assignmentscores[0]` it reads `scoreentrydate`, `scorepercent`, `ismissing` and `islate`.
6. **Attendance.** `GET /guardian/attendance.html`, then `table.grid`.
   - Day header cells are `th[title]`. The title holds the full date, such as `Mon, Oct 05, 2026`. It may end with ` : Not in session`.
   - The grid comes in two blocks. Each block has its own header rows. The script resets its date list at every row that has `th[title]`.
   - Body rows: the script skips the first two cells (course and expression). Each later cell is one day's code.
   - It ignores empty cells, `.` and `-`.
7. **Teacher comments.** `GET /guardian/teachercomments.html?fg=<term>`, using the current term, then `table.grid`.
   - Rows with at least five `td` cells count.
   - Course name: third cell. Comment: the last cell, which holds the text inside a `<pre>`.
8. **Grade History.** `GET /guardian/termgrades.html`, then `#grades-tbl`.
   - Rows with at least eight `td` cells count.
   - The first cell carries `data-sort="yyyy-mm-dd hh:mm:ss"`. The script keeps the first seven characters (year and month).
   - Course name: fifth cell. Letter grade: eighth cell.
   - The script keeps the last two months found.

Signed-out signals:
- A page fetch that is redirected outside `/guardian/`.
- Any 401 response. The assignment lookup returns 401 with JSON and no redirect.

### Running the script

Top-level `const` and `let` in an evaluated script persist across runs in the same page. A second run then fails with a redeclaration error. For that reason the script keeps everything inside one async function and returns one JSON string. Keep it that way when editing.

## Site map (all under `/guardian/`)

| Page | URL | In menu? | Rendering |
|---|---|---|---|
| Grades and Attendance (home) | `home.html` | yes | server HTML |
| Class Score Detail | `scores.html?frn=<frn>&begdate=<m/d/yyyy>&enddate=<m/d/yyyy>&fg=<Q1..Q4/S1/S2>&schoolid=<schoolId>` | via grade link | Angular shell + XHR JSON |
| Attendance dates (one course, one term) | `attendancedates.html?frn=<frn>&codes=*abs` (or `*tar`)`&term=<S1/S2>&mode=ATT_ModeMeeting&mode=ATT_ModeInterval` | via absence/tardy count | server HTML |
| Attendance dates, all terms | `attendancedatesall.html?frn=<frn>&codes=*abs\|*tar&term=...` | via "all" link | server HTML |
| Attendance history grid | `attendance.html` | no (hidden) | server HTML |
| Teacher Comments | `teachercomments.html?fg=<Q1..S2>` | no (hidden) | server HTML |
| My Schedule | `myschedule.html` | no (hidden) | server HTML |
| Grade History | `termgrades.html` | yes | server HTML (DataTable) |
| Progress/Performance Reports | menu item opens a new tab on `psplugin.seattleschools.org` | yes | external app, PDFs |
| School Information | `schoolinformation.html` | yes | server HTML |
| Preferences | `accountmanagement_profile.html` | yes | password change only |
| Teacher info popup | `teacherinfo.html?frn=<frn>&nolink=true` | via "Details about <teacher>" | server HTML |
| System Alerts | `notification/notificationDetailAJAX.action` | header link | password-security note only |

Direct URL navigation works for every page above. GET requests need no CSRF token.

`<frn>` is `004` plus an 8-digit section-enrollment id for a course. For the student it is `001` plus the student dcid. Take course frns from the hrefs on `home.html`. Do not construct them.

## Auth and session

- Signed in, `/guardian/home.html` has the title `Grades`. Signed out, it shows the login form ("Parent, Guardian, and Student Login"). Check the title, not just the URL.
- Sign in with a parent account. Stop after one failed login.
- A persistent browser profile stays signed in across a whole session.
- `keep-alive.js` shows a "stay signed in" dialog 120 seconds before the session expires. Check the title again on long runs.
- The login page may carry maintenance banners. They are not errors.
- Signed out mid-run, page fetches (`home.html`, `scores.html`) redirect through the F5 gateway (`/my.policy`) to a login page. `res.redirected` is true and the final URL is outside `/guardian/`. This was checked with no session. An expired session in a live tab is untested.

## Home page: `home.html`

Table `#tblgrades` has two header rows, one `tr[id^=ccid_]` per course, then a totals row.

Columns: `Exp` | `Last Week` (M T W H F) | `This Week` (M T W H F) | `Course` | `Q1` | `Q2` | `S1` | `Q3` | `Q4` | `S2` | `Absences` | `Tardies`.

- Each grade cell reads `<letter>` then `<percent>`. The course cell reads `<COURSE NAME> Email <teacher> - Rm: <room>`.
- `Exp` is the period plus a day pattern, such as `1(A)`. Non-academic rows use `HR(A)`, `CO(A)`, `LIB(A)`, or a numeric period for support classes.
- Counselor, library and support rows have no grade (only `[ i ]`) and no assignments. Advisory shows a pass grade (`P 100`).
- A `[ i ]` link means the term is not yet posted. Its href has no dates. A `td.notInSession` cell reading "Not available" means the term has not started.
- Early in the year the current term is the quarter column that holds a letter and percent. `S1` mirrors the running grade.
- The two week groups hold one attendance code per day. Blank means present. `.` means no class. `-` (grid only) means a non-instructional day.
- Absences and Tardies are counts per course. Each links to a per-course dates page. Counts are per class period, so one full-day absence counts once in every class. The totals row sums them.
- The "Show dropped classes" link (`home.html?schoolid=<id>&showdropped=true`) adds dropped courses.
- The home page has no teacher comment, citizenship or assignment data.
- The week date ranges appear only in the `attendance.html` header. `Last Week` and `This Week` cover about 9 to 14 days, depending on the weekday. Use `attendance.html` for an exact window.

### Attendance codes (legend on `home.html`)

- Blank: present.
- FT (Field Trip), IA (In Bldg), OA (OutBldg): authorized.
- AA, EA, FE, ME (medical/sick), QE, SS: excused absence.
- EL, LB (late bus): excused late.
- LE: left early, excused. LU: left early, unexcused.
- UA, VU: unexcused absence. UL: unexcused late.
- A: absent. L: late (excused status not stated).
- `.`: no meeting.

The script groups them as follows.
- Unexcused (Red): UA, VU, UL, LU, A.
- Tardy: L, EL, LB. UL counts as unexcused only.
- Excused absence: AA, EA, FE, ME, QE, SS.

Unexcused codes and Late markers were never seen live, so tests cover them with synthetic fixtures.

## Attendance grid: `attendance.html`

- Table `grid`. Header row 1: `Course | Expression | <m/d-m/d>` repeated, one column group per Monday-start week for the school year. Header row 2: `M T W H F` per week (`H` is Thursday).
- The grid comes in two blocks, each with its own header rows.
- Each day header cell carries a `title` with the full date. Read dates from the titles. Do not count columns.
- Course cell: course, teacher, room, and `E:` and `L:` enroll and leave dates.
- Body cells: one code per day. One sick day shows in every class row, so count it once per date.
- It is the best single source for exact dates of absences and tardies.

## Teacher comments: `teachercomments.html`

- Columns: `Exp. | Course # | Course | Teacher | Comment`.
- The term dropdown `#reportingTermHeadingSelect` navigates to `?fg=<term>`.
- The comment sits in a `<pre>` in the last column. Many cells are empty.

## Class Score Detail: `scores.html`

The script reads only `data-sectionid` from this page. The rest is for debugging.

Title: "Class Score Detail". The page is Angular. Wait for network idle, then check that `#scoreTable` has more than one row. Tables:

1. Course summary: `Course | Teacher | Expression | Term | Final Grade | Earned Cr Hrs / Potential Cr Hr`.
2. `#sps-assignment-categories`: `Category | # Assignments | Points Possible | Points Earned | Grade`. Teachers define the category names. No "Test" category exists. A test shows only in its title or category.
3. `#scoreTable`: `Due Date | Category | Assignment | Flags | Score | % | Grade | comments`. Newest due date first.
   - `Score` reads `earned/possible`, or `--/possible` when unscored.
   - `%` is the reliable number. The `Grade` letter can be a teacher scale label that differs from the JSON letter.

Legend: Has Description, Has Comment, Weighted, Collected, Late, Missing, Exempt from Final Grade, Absent, Incomplete, Excluded. The final grade may include unpublished assignments or special weighting.

### Assignment lookup response

The response is an array of assignments. Per item:
- `assignmentid`.
- `_assignmentsections[0]`: `duedate`, `totalpointvalue`, `scoreentrypoints`, `weight`, `iscountedinfinalgrade`, `isscorespublish`, `name`, `_assignmentcategoryassociations[0]._teachercategory.name`.
- `_assignmentscores[0]`: `scorepoints`, `scorepercent`, `scorelettergrade`, `actualscoreentered`, `scoreentrydate`, and the booleans `islate`, `ismissing`, `isexempt`, `iscollected`, `isabsent`, `isincomplete`.

Notes:
- Unscored items have an `_assignmentscores[0]` without `scorepercent`.
- A missing item auto-scores near 50%. It counts once, as missing.
- The payload holds no comment text.
- A school-year-wide range returns all published assignments for the section.
- Never batch sections. A multi-section call returns only some sections' items.

### Finding the ids

- Section id: `data-sectionid` in the HTML of the course's `scores.html` page.
- Student dcid: the digits after `001` in the totals-row link `attendancedatesall.html?frn=001<dcid>` on `home.html`. Two such links exist (absent and tardy totals) with the same digits.
- Never match a bare `frn=`. `home.html` has many other `frn=` links, and the `scores.html` links use the prefix `004`.
- On a scores page the digits also sit in `studentFRN = '001<dcid>'`, in a `data-ng-init` attribute. A second attribute, `data-studentfrn="studentFRN"`, holds no digits.
- Both ids are stable per student.

## Grade History: `termgrades.html`

- Server-rendered DataTable `#grades-tbl`.
- Columns: `Date Compl | Grade Level | School | Course # | Course | Credit Earned | Credit Attempted | Grade`.
- Rows are completed semester ends only (January and June), letter grades only, no percents. The current year appears when its semester closes.
- Course numbers change from year to year. Match a subject across years by course name.
- `(*)` marks courses not in GPA.
- Use it as the baseline for "course grade up or down from a prior term". It cannot show a within-quarter trend.

## Upcoming work

The Source has no upcoming assignments and no calendar. Use Schoology (`nav-schoology.md`). `myschedule.html` is the weekly class schedule only. Score Detail shows no future-dated assignments.

## Other pages

### Progress/Performance Reports (external app)

The menu item opens a new tab at `https://psplugin.seattleschools.org/ProgressReports/Reports/Index` after an OpenID redirect from `/guardian/openid/oidredirectaction.action?pluginName=SPS Performance and Progress Reports&studentContext=true`. It lists PDF links per school year and term (`/ProgressReports/Reports/View/<studentIdentifier>/<yearCode>/<termCode>/<schoolId>/en`). These are term-end snapshots. The script does not use them.

### Other menu items

Assessments, Books/Fines/Fees, School Choice, Schoology Access Codes, Data Verification Form, SchoolPay, Snow Routes and Highly Capable are menu items. Each goes through `oidredirectaction.action?pluginName=...` to an external app. They are not mapped in detail.

## Pitfalls

- Page headers and demographics carry the student's and guardian's names and IDs. Strip them before you share output.
- The page title stays `Grades` on home and `Class Score Detail` on scores.
- An analytics (Pendo) XHR fires on every click. Ignore `aptrinsic`.
- No page uses pagination or "show more". Grade History is one table.
- Other XHRs on the scores page are i18n files, templates and analytics. Ignore them.

## Reading the site without the script (manual debugging)

Use this when a selector or route breaks and you need to see what the site now returns.

- **Open pages by URL.** Direct URLs work for every page in the site map. This is the most reliable route.
- **Do not rely on clicking grade links.** In browser automation, a plain click on a grade link sometimes did nothing. Moving focus to the link and pressing Enter worked every time. Reading the link's `href` and opening it (hrefs are relative to `/guardian/`) is equally safe.
- **Read page text for tables.** The text of `#tblgrades` is tab-separated and readable. So is `table.grid` on the attendance page. To map a code to a date there, count cells after the Expression cell, or read the header `title`.
- **Scores page is Angular.** Wait for network idle plus a second before reading.
- **Flags are unreliable as text.** Each row has seven fixed flag cells, in this order: collected, late, missing, exempt, absent, incomplete, excluded.
  - Every row carries all seven screen-reader labels, whether or not the flag is set. Text and accessibility-tree reads therefore show every flag on every row.
  - A set flag is an extra icon `div` with `role="presentation"` and no text. Only a screenshot shows it. The icon sits in its column position.
  - Score text cannot separate "missing" from "scored low". A missing item auto-scores near 50%, and a teacher can also enter 50% with no flag. Read `ismissing` from the JSON instead.
- **The comments column is not a comment signal.** The `View` link appears whenever the row has a description, a score comment or a category description. A category description alone is enough, so nearly every row has it. It opens a "Student Score Detail" dialog (Assignment, Category, Category Description). A "Teacher Comments" box appears when a comment exists. Close it with the `Close` button.
- **Network log.** The browser's network log keeps history from other tabs. Clear it first, then filter to XHR and fetch requests.

## Open questions

- Unexcused absence and tardy codes and the Late flag were never seen live. Confirm each on a real example.
- Do score comments ever appear (the Teacher Comments box in the row dialog, `teachercomments.html`)?
- Session timeout length.
