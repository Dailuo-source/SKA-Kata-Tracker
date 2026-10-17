# SKA Kata Tracker: handoff notes

Tracks which kata each member of **Scarborough Academy of Karate (SKA)** knows. Members can see their own and everyone else's progress; instructors unlock with the shared password to update statuses and see who's ready to grade. Built to sit in the dojo's Wix site and to work on phones (Gary: Samsung Android, Chrome).

## Where things live

| Piece | Location |
| --- | --- |
| Live app | https://dailuo-source.github.io/SKA-Kata-Tracker/ (GitHub Pages from `main`, root folder, `.nojekyll`, no build step). Never put Gary's full name in a web address |
| Database | Google Sheet **S.A. Karate Kata Tracker** in garyluo.gs@gmail.com's Drive, id `1QYVdiW5kZ5j-EvSQzZJ-GE12ZqwY2OUgTsSIzIloiHk` |
| Backend | Apps Script project **Karate Kata List** bound to the sheet (id `111lCaHWu0gtPF8-jiEXuhYeEqizKrjg1Kh4eybj7NU7gigJ48_1eN8xD`); source is `Code.gs` here. Web app: `https://script.google.com/macros/s/AKfycbwnmXKngbUjC-NAThAD_s7R2JdaKGX5e9R3cjJYdQlkEoWbe84nbdILOKVVsGiRbIlpqw/exec` (Execute as Gary, access Anyone) |

Why two addresses: the page used to be served by Apps Script itself, but on phones signed in to several Google accounts Google rewrites the link to `/macros/u/5/...` and shows "Sorry, unable to open the file". The page now lives on GitHub Pages and calls the script with `fetch` (no cookies, so no account switching). Opening the old /exec link shows "The Kata Tracker has moved" with a button to the new address (keeping `?kata=` and `?from=`).

## API (`Code.gs`)

- `POST` (body sent as `text/plain` to avoid a CORS preflight): `{"action": "getData" | "verifyPin" | "saveStatus", "args": [...]}` → `{ok, result}` or `{ok:false, error}`.
  - `getData()`: dojo name, belts (with colours), statuses, kata, active members, progress matrix. Never returns the password.
  - `verifyPin(pin)`: checks the password; returns the sheet's URL (only after a correct password). 8 wrong tries lock editing for 15 min.
  - `saveStatus(pin, member, kata, status, instructorName)`: writes one Progress cell ('' clears it) and appends to Log.
- `GET ?api=summary`: every kata with rank belt, Learned at belt and how many active members still need it (counts only). Used by the SKA Lesson Planner.

## Sheet

- **Kata**: Order, Kata, English Translation, Category (Solo / Multi-person / Weapon), Belt (= rank), Notes, **Learned at** (the belt the Karate Instructor Handbook v2.3 expects it learned at; "Blue/Purple" is the shared list; blank = not required for grading).
- **Members**: Name, Belt, Active (No hides someone without losing history), Notes. Juniors are listed by initial + surname on purpose.
- **Progress**: one row per member, one column per kata (A Member, B Belt via ARRAYFORMULA). New members/kata get rows/columns automatically, or via the sheet menu **Kata Tracker → Sync progress**.
- **Log**: every change from the app (time, member, kata, status, instructor name).
- **Settings**: Dojo name (B2), Instructor password (B3), statuses in D2:D10 (Learning, Knows, Proficient; anything after the first counts as knowing), belts with colours from row 7, notes in column F.

## App (`index.html`, one file)

- Look (Gary's choices): same as the SKA Lesson Planner (red #C8102E header with the dojo logo, black secondary, M PLUS Rounded 1c + Nunito Sans) on a light grey page (#ECECEA) with white cards. No dark mode.
- Tabs: **Members** (belt groups, foldable, search) and **Kata** (search, Solo / Multi-person / Weapon). Kata are grouped by their expected belt (Learned at if set, else rank).
- **Instructor mode** (password; "Stay unlocked on this device" keeps it in `kt.pin`) adds: the **Ready to grade** tab, "Ready for X"/"N to go" badges, the "Still needs" panel on member cards, Learned at chips, and editing. Members (locked) never see readiness, by Gary's choice.
- Ready to grade: every kata whose Learned at belt is at or below the member's belt must be Knows/Proficient. White and Black belts have no check. Empi Yonin Dori is ranked Purple but learned at Green.
- Editing: member page → tap a status → pick one; kata page → tap Learning / Knows / Proficient (tap again to clear). Every change asks "are you sure", then shows Undo for 8 s. The kata page's "Still need it" list stays fixed while open so rows don't jump.
- Opens instantly from the last copy (`kt.data`), then refreshes. Back button: screens and panels are history steps.
- Lesson Planner link: `?kata=<name>&from=planner` opens that kata, asks for the password if locked, and shows "Back to the lesson plan" (closes the tab, else goes to the planner).

## Changing things

- Browser: Gary has several Chrome instances connected; the one signed in to garyluo.gs@gmail.com, GitHub (Dailuo-source) and Cloudflare is **GARYMAIN**.
- Page: edit `index.html`, commit, push to `main`; GitHub Pages publishes in about a minute.
- Hosting note: Gary's apps normally use Cloudflare Pages (Android won't install two apps from one site). This one went on GitHub Pages because the Claude extension can't open dash.cloudflare.com and Gary was away from his desktop. Pantry Pal is also on dailuo-source.github.io, so before making this an installable app, move it to Cloudflare Pages (project `ska-kata-tracker`, connect this repo, no build) and update `SITE_URL` in Code.gs and `KATA_SITE` in the Lesson Planner.
- Code.gs: paste into the script project and redeploy (**Deploy → Manage deployments → pencil → New version**; the /exec URL stays the same). Through Claude in Chrome: open the project, set `monaco.editor.getModels()[0]` to the raw GitHub `Code.gs` (fetch by commit SHA), Ctrl+S, redeploy. Reading code out of Monaco needs chunks under ~1,000 characters with `=`/`;`/`&`/`?` swapped out, or the extension blocks the output.
- Commits use author `Claude <noreply@anthropic.com>`.
- Testing: Playwright with `script.google.com` routed to a mock that answers the three actions.
