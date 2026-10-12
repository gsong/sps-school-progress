# sps-school-progress

A Claude plugin that checks how a student is doing at school. Ask Claude Desktop a plain question, such as "how is she doing in school?". Claude reads both school sites in its built-in browser and reports:

- Red flags: missing work, a course grade below 70%, an unexcused absence, or a score below 60% in the last two weeks.
- Yellow flags: late work, a course grade from 70% up to 83%, tardies or excused absences on 3 or more school days in the last two weeks, or a negative teacher comment.
- Bright spots: scores of 90% or more in the last two weeks, a positive teacher comment, or a grade trending up.
- Coming up: assignments and events in the next 7 days, and tests, quizzes and projects in the next 14 days.

The Source decides what counts as missing or late. Schoology's overdue list appears under Coming up as "not marked submitted in Schoology", never as a flag. Work turned in on paper shows up on that list too.

Schoology shows only what teachers post. An empty Coming up means nothing was posted, not that nothing is due.

It works only with Seattle Public Schools' The Source (`ps.seattleschools.org`) and Schoology (`app.schoology.com`), signed in with a parent account that has one student.

## Install

In Claude Desktop, open Customize > Plugins > Add plugin > Add marketplace, and add `gsong/sps-school-progress`. Keep **Sync automatically** on, then add the plugin.

## Signing in

The plugin stores no passwords. When a Check finds a school site signed out, Claude leaves its login page open in the browser pane. It asks you to sign in there and reply "done", then goes on.

The Source signs you out after 10 minutes idle, so expect to sign in there on most Checks. Both sites sign you out when Claude Desktop quits.

The first time Claude opens each site, the browser asks you to approve it. Choose "always".

A Check needs the browser's JavaScript tool. Without it, Claude stops and says so. Reading the pages alone would miss missing and late work.

## Layout

- `.claude-plugin/marketplace.json`: the marketplace.
- `plugins/sps-school-progress/`: the plugin, with one skill, `check`, and its in-page scripts.
- `docs/`: maintainer notes on how each school site's pages and JSON are laid out.
- `test/`: offline tests with invented data.

## Development

```bash
pnpm install
pnpm test
```
