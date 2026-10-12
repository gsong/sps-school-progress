# SPS School Progress

Ask Claude "how is she doing in school?" and get one short report from The Source and Schoology: what needs attention, what's going well, and what's due soon.

It works for Seattle Public Schools families. The Source is the district's grades and attendance website, and Schoology is where teachers post assignments. Claude reads both with your parent logins, so you don't have to click through either one.

You need a paid Claude plan and the Claude Desktop app. See [What you need](#what-you-need).

## What the report tells you

Each report has four parts.

- **Red flags** need action now. For example: a missing assignment, a class grade below 70%, an unexcused absence, or an assignment or test scored below 60% in the last two weeks.
- **Yellow flags** are worth watching. For example: work turned in late, a class grade between 70% and 83% (C- to B-), arriving late on 3 or more school days in two weeks, excused absences on 3 or more school days in two weeks, or a teacher comment that sounds worried.
- **Bright spots** are good news. For example: a score of 90% or more in the last two weeks, a teacher's praise, or a grade that keeps going up.
- **Coming up** lists what's ahead: assignments and events in the next week, and tests, quizzes and projects in the next two weeks.

You can also ask something narrower, such as "what's due this week?" or "how is she doing in science?".

## What you need

- **A paid Claude plan, such as Pro.** This doesn't work on Claude's free plan.
- **The Claude Desktop app.** Claude needs the app's built-in web browser to open the school websites. A chat in a web browser at claude.ai can't do this. It was tested on a Mac.
- **Your parent logins** for The Source and for Schoology. Each account should have one student on it.

## Set it up, once

1. Open Claude Desktop. Go to **Settings**, then **General**. Check that **Preferred browser** says **Built-in browser**.
2. Go to **Customize**, then **Plugins**. Choose **Add plugin**, then **Add marketplace**, then **Add from a repository**.
3. Type `gsong/sps-school-progress` and add it. Leave **Sync automatically** turned on, so you get fixes without doing anything.
4. Find **SPS School Progress** under **Discover**, and choose **Add**.
5. Start a new chat and ask "how is she doing in school?".
6. Claude opens each school website in a browser panel next to the chat. The first time, Claude asks permission to use the site. Choose **always**, so it doesn't ask again.
7. When Claude asks you to sign in, sign in inside that panel, then type "done" in the chat.

When the report appears, you're set up.

## Each time you ask

Claude doesn't keep your passwords. When a school website has signed you out, Claude shows its login page in the panel and waits. Sign in there, type "done", and Claude carries on.

Expect to sign in to The Source most times. It signs you out after 10 minutes without use. Both websites also sign you out whenever you quit Claude Desktop.

## Things to know

- **Schoology's "overdue" list isn't the final word.** Work handed in on paper can still show as overdue there. The report lists these items under Coming up as "not marked submitted in Schoology". Only The Source decides whether work is missing.
- **An empty Coming up means nothing was posted.** Some teachers don't put due dates in Schoology. It doesn't mean nothing is due.
- **If a school website changes its layout,** Claude says which one it couldn't read, and still reports from the other. [Open an issue](https://github.com/gsong/sps-school-progress/issues) so it gets fixed.

## For developers

- `.claude-plugin/marketplace.json`: the marketplace.
- `plugins/sps-school-progress/`: the plugin, with one skill, `check`, and the scripts it runs inside each school website's page.
- `docs/`: maintainer notes on how each school website's pages and data are laid out.
- `test/`: offline tests with invented data.

CI runs the tests on every pull request and every push to `main`.

```bash
pnpm install
pnpm test
```
