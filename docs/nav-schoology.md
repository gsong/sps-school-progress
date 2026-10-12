# Navigation map: Schoology (parent account)

Base: `https://app.schoology.com/`. This guide is for a maintainer fixing `plugins/sps-school-progress/skills/check/scripts/schoology.js` after the site changes. The skill never loads it. It records structure only, never student data.

## What the script uses

The script runs in the page at `/parent/home`. It reads these routes and fields, in this order.

1. **Page state.** Signed out, the path is `/login`. Signed in, the path is `/parent/home` and `document.title` is `Summary | Schoology`.
2. **Child id.** `GET /iapi/parent/info` returns `{response_code, body:{children:{<key>:{uid, ...}}}}`.
   - `body.children` is an object, not an array.
   - The script reads `uid` from each child. It stops with `site-changed` when the account has more than one child.
3. **Calendar feed.** `GET /parent/calendar?ajax=1&start=<epoch s>&end=<epoch s>`. The range runs from midnight today to midnight 15 days ahead. The response is a JSON array. Per event the script reads:
   - `child_uid`: events for another child are skipped.
   - `start`: the first ten characters, `yyyy-mm-dd`.
   - `e_type`: `assignment` and `assessment` keep their type. Anything else counts as `event`.
   - `titleText`, or `title` when `titleText` is missing. The script strips tags and a trailing ` - DUE m/d`.
   - `content_title`: the course name is the text before the first `:`.
4. **Overdue feed.** `GET /iapi/parent/overdue_submissions/<childUid>` returns `{response_code, body:{html}}`. The script parses `body.html` as an HTML fragment. It does not read the rendered home page.
   - Item: `.upcoming-event`. Its `data-start` is the due time in epoch seconds. It matches the item's `DUE mm/dd` text.
   - Title: `.event-title a`. Course: `.realm-title-course`.
   - The feed also lists items not yet due. The script keeps only items due before today.

Windows, counted forward from today:
- 7 days for assignments and events.
- 14 days for assessments (tests and quizzes) and for titles that contain "project". Schoology has no separate project type.

Signed-out signals:
- A JSON fetch that was redirected to `/login`. Schoology answers 200 with HTML, so the status alone is not enough.
- A non-JSON response with no redirect is not a sign-out. The script returns `site-changed` for it.

### Running the script

Top-level `const` and `let` in an evaluated script persist across runs in the same page. A second run then fails with a redeclaration error. For that reason the script keeps everything inside one async function and returns one JSON string. Keep it that way when editing.

## What Schoology supplies

- Schoology feeds only "coming up" and a weak overdue hint. It has no grades, no attendance and no teacher comments.
- Coverage depends on each teacher. Many courses post no dated items and read "No upcoming assignments or events". Items that The Source's gradebook lists may not appear here.
- Treat an empty Schoology as "nothing posted", never as "nothing coming".
- **Overdue is not Missing.** Schoology overdue means only "no submission recorded here". Paper or off-platform work lands in it. Use it as a cross-check, never as a Red flag by itself. Match items to The Source by course and due date, because titles differ.
- Parent view has no grade report, no gradebook and no parent summary page. Course tabs are only Materials and Updates. `/parent/grades` and `/parent/attendance` redirect to `/parent/home`. `/grades` (own user view) is an empty shell. Grades and attendance live in The Source (see `nav-the-source.md`).

## Auth and session

- Sign in with a parent account at `/login`, using the direct email and password form (not "SSO Login"). Signed in lands on `/parent/home`.
- Signed out, pages redirect to `/login?destination=...` with the title "Log in to Schoology".
- An in-page `fetch` of a JSON endpoint such as `/iapi/parent/info` still returns 200 when signed out, because it follows the redirect. Test `res.redirected` plus a `/login` path, or a content type that is not JSON. Signed in, the endpoint returns `application/json` starting `{"response_code`. This was checked with no session. An expired session in a live tab is untested.
- A persistent browser profile stays signed in across a whole session. A `session-tracker.html` iframe from `asset-cdn.schoology.com` polls in the background.
- Two modes exist:
  - Parent child-view (`/parent/...`). The header button shows the child's name.
  - The parent's own user view (`/home`, `/api`, `/grades`). The header shows the parent's name.
- The header menu has a child switcher (link `/parent/switch_child/<childUid>`), Settings (`/parent/settings/account`) and Logout (`/logout?ltoken=...`). Do not hit Logout by accident.
- The menu items "Your Profile", "<school>" and "Add Child" exist but are unexplored.

## Site map

| Page | URL | Rendering |
|---|---|---|
| Parent home | `/parent/home` | server HTML + 2 XHRs |
| Child course page (preview) | `/course/<sectionId>/preview/<childUid>/parent` | server HTML |
| Course materials | `/course/<sectionId>/materials` (filters `?list_filter=assignments\|assessments\|documents_files\|documents_links\|discussion\|pages\|album\|scorm\|web\|documents_external_tools\|course_assessment`; folder `?f=<folderId>`) | server HTML |
| Course updates (teacher posts) | `/course/<sectionId>/updates` | server HTML + JSON |
| Assignment detail | `/assignment/<assignmentId>` redirects to `/assignments/<assignmentId>/info` (or `/course/<sectionId>/preview/<childUid>/parent?url=assignment/<assignmentId>`) | server HTML |
| Overdue popup | `/home/overdue-popup/<childUid>/parent` | full HTML page (mostly boilerplate) |
| Calendar | `/parent/calendar` | React/FullCalendar + JSON |
| Parent settings | `/parent/settings/account`, `/parent/settings/notifications` | server HTML |
| API credentials | `/api` | server HTML |

## Parent home (`/parent/home`)

Left: a "Courses" table with a `Current` / `Past` dropdown. One row per course. Link text is `<COURSE NAME>: <term> <period>(A) <section>`. The href is `/course/<sectionId>/preview/<childUid>/parent`. It includes non-academic sections (library, advisory, counselor). The `Past` dropdown shows prior-year courses.

Right column (`#right-column`):
- "To Do" has two groups. Each item is `.upcoming-event.upcoming-event-block.course-event`, holding `.upcoming-item-content`, `.event-title` and `.event-subtitle` (course tooltip).
  - `OVERDUE`: container `#overdue-submissions`. Item text: type ("Assignment."), title ending `- DUE mm/dd`, "<N> days overdue", course. Items link to `/assignment/<assignmentId>`. A "popup" link goes to the overdue-popup URL.
  - `UPCOMING`: container `.upcoming-events .upcoming-list`, grouped under `.upcoming-date-title` headings. Item text carries the full due date with year and time ("Due <Weekday>, <Month> <d>, <yyyy> at <time>"). The look-ahead window is not documented. Use the calendar feed for the 7 and 14 day windows.
- "Upcoming Events" box. It reads "No upcoming events" when empty. School events appear here and on the calendar.
- A "Student Activity" heading exists. No feed content was seen.

The upcoming list has no JSON feed. The server renders it into the page HTML.

### XHR endpoints on home (session cookie, same-origin GET)

- `GET /iapi/parent/info`: see "What the script uses". Each child also has `username`, `profile_url`, `profile_tiny` and `recent_counts`. `recent_counts` is a small object with keys 1 to 4. Its meaning is not determined. The response also has `body.session:{view_child, view_mode}`.
- `GET /iapi/parent/overdue_submissions/<childUid>`: see "What the script uses". It is not a clean overdue list. Items not yet due appear too, labelled "N days overdue". Parse each item's `data-start` (or its `DUE mm/dd` text) and keep only dates before today.

## Calendar (`/parent/calendar`)

- Tabs: Today, Month (default), Week, Day. There is no List view, no iCal or subscribe link and no filter dropdown.
- Grid cells are `gridcell` with aria-labels like "<Weekday>, <Mon> <d> - Press Enter or Space to create an event". Ignore the create hint. Do not create events. Today's cell reads "<d> (Today)".
- The month grid also shows the leading and trailing partial weeks. Prev and next arrows move the range.

JSON feed: `GET /parent/calendar?ajax=1&start=<unix epoch s>&end=<unix epoch s>`. The response is a JSON array of events with keys `id, title, titleHTML, titleLink, titleText, start, end, allDay, has_end, e_type, realm, realm_id, className, content_id, content_title, event_uid, user_id, child_uid, child_name, body, editable`.

- `e_type` values seen:
  - `assignment`: the title ends `- DUE mm/dd`. `titleLink` is an `<a href="/assignment/<id>">`.
  - `assessment`: tests and quizzes. `className` has `assessment-icon`.
  - `event`: school and course events, often `allDay: true`.
- `realm` is `"course"`. `className` includes `ev-course`. No separate type exists for projects. Recognise them by title.
- `start` and `end` are strings (datetime). `content_id` is a string id. `title` is an HTML anchor for assignments and assessments, so strip tags. `titleText` is plain text.
- One fetch with `start` and `end` spanning the whole school year returns every item in one response. That makes it the best source for the 7 and 14 day windows.

## Per-course pages

- `/course/<sectionId>/preview/<childUid>/parent` is the parent landing page. The right "Information" sidebar shows a Grading period line (semester name and date range), the "You are viewing <child>'s course" note, and a mini "Upcoming" calendar for that course. Teacher-added links, such as publisher tools, sit in the top bar.
- **Use the preview URL.** Direct `/course/<sectionId>/materials` and `/updates` returned "Private Access Only" for some courses and worked for others. The failures were not consistent per course. The preview landing always worked.
- Materials tree: folders by unit or quarter. Assignments inside show title, due date and the teacher's instructions. `?list_filter=assignments` lists only assignments. It loads `/course/<sectionId>/calendar_ajax?list_filter=assignments&original_q=...` and `course_reminders_ajax` as JSON with HTML. The same cookie works.
- Updates tab: "Most Recent" teacher posts, plus the same mini upcoming list (`/course/<sectionId>/calendar_ajax?original_q=course/<sectionId>/updates`).
- Parent view shows no gradebook, no submission status and no "mark complete". A parent cannot see whether the child submitted. Only the overdue list hints at it.
- Some courses embed a PDF viewer iframe ("Document Viewer") on the landing page. Ignore it.

## Assignment detail (`/assignments/<assignmentId>/info`)

- Title: `<assignment title> - DUE mm/dd | Schoology`.
- Contents: title, description (teacher instructions, can be long), an "Immersive Reader" widget, and attachments or links as in the course.
- No due-time field appears in the DOM headings. The time shows in the overdue tooltip and the course mini-calendar, for example "11:59 pm".
- The page is server-rendered with one React bundle XHR.

## Notifications and digests (read only)

`/parent/settings/notifications` is a tab next to "Account Settings".
- "Parent Email Digest": `select[name=status]` (Off/On), `select[name=frequency]` (Daily/Weekly), `input[name="day_of_week[0..6]"]` checkboxes (S M T W T F S), and time selects.
- "Overdue Submissions Email": `select[name=overdue_submission]` (Off/On).

Do not change these. Turning either on could complement scraping, but needs user approval. The header bell and messages show unread counts only on the own-user view. `/parent/settings/account` holds name, email and password. Nothing there is useful.

## REST API (`/api`)

The `/api` page has the title "Manage API Credentials". Without a key it says "At the moment you do not have a registered API key. Click the button below to create your key." A "Request API Key" submit button means keys can be requested. Parent keys apply to the parent's own account scope. It is unverified whether the REST API exposes a child's assignments or events. If keys are issued, the REST base is `https://api.schoology.com/v1/` (OAuth 1.0a, key and secret).

## Terms, courses and dates

Course names carry the term and slot: `<COURSE>: <S1|S2> <period>(A) <section#>`. Schoology uses semesters (S1/S2). The Source shows quarters (Q1 to Q4). The course page's Grading period line gives the semester date range. Match a Schoology course to its Source row by period (`Exp`) and course name.

## Pitfalls

- Assignment titles carry `- DUE mm/dd` without a year. Use the calendar JSON `start` (full date), the overdue item's `data-start`, or the home Upcoming text.
- Parent view hides submission state, grades and teacher comments. Do not infer completion from absence from the overdue list.
- Header and UI strings include the parent's and child's names and the school. Strip them before you share output.
- Most pages are server-rendered with scattered ajax. The calendar and the page header are React. Wait for network idle before reading.
- Do not click "Request API Key", Logout, event grid cells (they create events), "Add Child" or the digest selects.

## Reading the site without the script (manual debugging)

Use this when a feed or selector breaks and you need to see what the site now returns.

- **Home page text.** The text of `#right-column` lists both To Do groups and the Upcoming Events in plain lines. An interactive-elements snapshot shows the items as links under the OVERDUE and UPCOMING headings. The due date is in the link text.
- **Calendar events.** An interactive-elements snapshot shows no events. A full accessibility snapshot lists each event as a button named `<type><COURSE>: <term> <slot> <section><child name>`. A text node with the title (`<title> - DUE mm/dd`) and a time (`11:59 pm`) follows it. The type word is `assignment`, `assessment` or `event`.
  - Events sit in the grid under their day's row. Map a title to its date by its `DUE mm/dd` text.
  - School events carry no date text. Use the JSON `start` or the grid position.
  - If the 14-day window crosses a month end, click the next-month arrow.
- **Clicks.** A plain click on a course link sometimes returned nothing and did not navigate. Calling `el.click()` in the page, then waiting for network idle, was reliable.
- **Network log.** The browser's network log keeps history from other sites. Clear it first, filter to XHR and fetch requests, and ignore `aptrinsic` (analytics).

## Open questions

- Look-ahead window (days) of the home "Upcoming" list.
- Whether the REST API works with a parent key for child data. Trying it needs a key request, which is a state change.
- Meaning of the `recent_counts` keys 1 to 4 in `/iapi/parent/info`.
- Session timeout length.
- Whether a per-course "Grades" tab appears when a teacher shares the gradebook with parents. None was seen.
