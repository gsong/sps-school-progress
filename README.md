# sps-school-progress

A Claude plugin that checks how a student is doing at school. Ask Claude Desktop a plain question, such as "how is she doing in school?". Claude signs in where needed, reads both school sites in its built-in browser, and reports:

- Red flags: missing work, a course grade below 70%, an unexcused absence, or a score below 60% in the last two weeks.
- Yellow flags: late work, a course grade from 70% up to 83%, or tardies or excused absences on 3 or more school days in the last two weeks.
- Bright spots: scores of 90% or more in the last two weeks.
- Coming up: assignments and events in the next 7 days, and tests, quizzes and projects in the next 14 days.

It works only with Seattle Public Schools' The Source (`ps.seattleschools.org`) and Schoology (`app.schoology.com`), signed in with a parent account that has one student.

## Install

In Claude Desktop, open Customize > Plugins > Add plugin > Add marketplace, and add `gsong/sps-school-progress`. Keep **Sync automatically** on, then add the plugin.

## Layout

- `.claude-plugin/marketplace.json`: the marketplace.
- `plugins/sps-school-progress/`: the plugin, with one skill, `check`, and its in-page scripts.
- `docs/`: maintainer notes on how each school site's pages and JSON are laid out.
- `test/`: offline tests with invented data.
