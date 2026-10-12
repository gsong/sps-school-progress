---
name: check
description: Checks how a student is doing at a Seattle Public Schools school, from the parent's The Source and Schoology accounts. Use for grades, missing or late work, attendance, a named course, or what's due or coming up.
---

# Check

A Check reads both school sites in the browser and reports Red flags, Yellow flags, Bright spots and Coming up. Two scripts do all the reading. Run each one unchanged; never rewrite or summarize a script.

## 1. Load the browser tools

The browser tools start deferred. Search for `navigate` and `javascript_tool` by name and load them. If `javascript_tool` is unavailable, stop here. Tell her the browser's JavaScript tool is missing, and to let George know. A Check without it would miss missing and late work, so no other way of reading the pages counts.

## 2. Find the scripts

The scripts are `scripts/the-source.js` and `scripts/schoology.js`, in this skill's base directory. If a file is not there, search the file system for it by name, under any folder whose path contains `sps-school-progress`. Read both files in full before going on. Done when you hold the text of both.

## 3. Test both sign-ins

For each site, `navigate` to its home page, then run `JSON.stringify({ path: location.pathname, title: document.title })` with `javascript_tool`.

| Site | Home page | Signed in | Signed out |
|---|---|---|---|
| The Source | `https://ps.seattleschools.org/guardian/home.html` | path `/guardian/home.html`, title "Grades" | path `/public/home.html` |
| Schoology | `https://app.schoology.com/parent/home` | path `/parent/home`, title "Summary \| Schoology" | path `/login` |

Any other page means the site changed. If the browser asks to approve a site, tell her to choose "always".

## 4. Ask once to sign in

If any site is signed out, send one message naming every signed-out site. Ask her to sign in to each in the browser pane and reply "done". Wait for her reply in this chat, then repeat step 3. A site still signed out after that goes in the report as unread.

## 5. Run the scripts

For each signed-in site, `navigate` to its home page and run its script's full text with `javascript_tool`. Each returns one JSON string with a `status`:

- `ok`: use it in the report.
- `signed-out`: the session ended mid-Check (The Source signs out after about 10 minutes idle). Ask her once more to sign in, as in step 4, then rerun that script.
- `site-changed`: the site no longer looks the way the script expects. Keep its `reason` for George.

## 6. Report

<!-- TODO(What does a Check report look like?): final layout, follow-up questions, and how gaps read. -->

Cover what she asked: a full Check, Coming up only, or one course. Show a plain list in this order:

1. Red flags
2. Yellow flags
3. Bright spots, plus any trend you see in `recentScores` or `gradeHistory`, and any positive teacher comment
4. Coming up, plus Schoology's `overdue` list, labelled "not marked submitted in Schoology". It is never a flag by itself. <!-- TODO(Which School site wins when they disagree?) -->
5. What couldn't be read

Read teacher comments for tone: a negative one is a Yellow flag, a positive one a Bright spot. If a site returned `site-changed`, report from the other site, name the broken one, and tell her to let George know. Schoology shows only what teachers post, so an empty Coming up means "nothing posted", not "nothing due".
