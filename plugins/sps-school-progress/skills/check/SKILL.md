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

## 3. Read each site, one at a time

The browser pane shows one page at a time, so finish one site before opening the next. Do The Source first, then Schoology. For each site:

1. `navigate` to its home page, then run `JSON.stringify({ path: location.pathname, title: document.title })` with `javascript_tool`, and classify the result:

   | Site | Home page | Signed in | Signed out |
   |---|---|---|---|
   | The Source | `https://ps.seattleschools.org/guardian/home.html` | path `/guardian/home.html`, title "Grades" | path `/public/home.html` |
   | Schoology | `https://app.schoology.com/parent/home` | path `/parent/home`, title "Summary \| Schoology" | path `/login` |

   Any other page means the site changed.
2. If it is signed out, leave its login page showing. Ask her to sign in to that site in the browser pane and reply "done". If the browser asks to approve the site, tell her to choose "always". Wait for her reply in this chat, then repeat substep 1. A site still signed out after that goes in the report as unread.
3. Once it is signed in, run its script's full text with `javascript_tool` on its home page. The script returns one JSON string with a `status`:
   - `ok`: use it in the report.
   - `signed-out`: the session ended before the script finished. Ask her to sign in again, as in substep 2, then rerun the script once.
   - `site-changed`: the site no longer looks the way the script expects. Keep its `reason` for George.

Done when both sites have a result or are marked unread.

## 4. Report

<!-- TODO(What does a Check report look like?): final layout, follow-up questions, and how gaps read. -->

Cover what she asked: a full Check, Coming up only, or one course. Show a plain list in this order:

1. Red flags
2. Yellow flags
3. Bright spots, plus any trend you see in `recentScores` or `gradeHistory`, and any positive teacher comment
4. Coming up, plus Schoology's `overdue` list, labelled "not marked submitted in Schoology". It is never a flag by itself. <!-- TODO(Which School site wins when they disagree?) -->
5. What couldn't be read

Read teacher comments for tone: a negative one is a Yellow flag, a positive one a Bright spot. If a site returned `site-changed`, report from the other site, name the broken one, and tell her to let George know. Schoology shows only what teachers post, so an empty Coming up means "nothing posted", not "nothing due".
