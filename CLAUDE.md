# SKA Kata Tracker — Brief

> **Claude: read this first.** Open only the files a change touches, and use the code map below to jump to a function instead of reading whole files.
> `index.html` is about 150 KB (~38k tokens): don't read it whole; search for a function name (e.g. `grep -n "function render" index.html`) and read just that function.
> `Code.gs` is about 38 KB (~10k tokens): don't read it whole; search for a function name (e.g. `grep -n "function render" Code.gs`) and read just that function.
> At the end of a work session, update **Status** and add one line to **Changelog** (keep about 10).

Tracks which kata each member of **Scarborough Academy of Karate (SKA)** knows. Built to sit in the dojo's Wix site (already behind its members' sign-in) and to work on phones (Gary: Samsung Android, Chrome).

## Access levels (Gary's rules; Code.gs enforces them, the page only follows)

| Who | Sees and does |
| --- | --- |
| Signed out | The dojo's kata list only (no names, no counts) |
| **Member** | Their own kata (and family members an admin has linked); taps a kata to **ask** for Learning / Knows / Proficient with an optional note; can withdraw; asks to link a family member. Never sees others, readiness or Ready to grade |
| **Moderator** | Overview, Members, Kata, Grid, Requests (approve/decline with Undo), Readiness ("for now"; Gary may revoke it); changes statuses (are you sure + Undo, or the Grid's one Save + Undo) |
| **Admin** | Everything, plus the **Access** tab: set levels, make/remove access codes, approve family links (admins only), remove links, add people not on the member list (instructors, parents), turn off the temporary password |

- Sign-in is a personal **access code** for now (6 characters like `K7P-4QX`, no 0/O/1/I/L). Gary later wants to use the dojo website's sign-in instead. A code is shown once when made; only `SHA-256("ska-kata:" + CODE)` is stored. Making a new code or removing it signs that person out everywhere. Sheet menu **Kata Tracker → Make an access code…** also makes one (that's how the first admin was made). **Sign everyone out** rotates `TOKEN_SECRET`.
- Can't remove or demote the last admin who has a code.
- **TEMPORARY PASSWORD**: the old shared instructor password (Settings B3) still signs in as Moderator until an admin taps **Turn it off** (Script Property `PASSWORD_OFF` = 1). Gary wants the button and code removed later so there's no back door: search Code.gs and index.html for `TEMPORARY PASSWORD`.

## Where things live

| Piece | Location |
| --- | --- |
| Live app | https://dailuo-source.github.io/SKA-Kata-Tracker/ (GitHub Pages from `main`, root folder, `.nojekyll`, no build step). Never put Gary's full name in a web address |
| Database | Google Sheet **S.A. Karate Kata Tracker** in garyluo.gs@gmail.com's Drive, id `1QYVdiW5kZ5j-EvSQzZJ-GE12ZqwY2OUgTsSIzIloiHk` |
| Backend | Apps Script project **Karate Kata List** bound to the sheet (id `111lCaHWu0gtPF8-jiEXuhYeEqizKrjg1Kh4eybj7NU7gigJ48_1eN8xD`); source is `Code.gs` here. Web app: `https://script.google.com/macros/s/AKfycbwnmXKngbUjC-NAThAD_s7R2JdaKGX5e9R3cjJYdQlkEoWbe84nbdILOKVVsGiRbIlpqw/exec` (Execute as Gary, access Anyone) |

Why two addresses: the page used to be served by Apps Script itself, but on phones signed in to several Google accounts Google rewrites the link to `/macros/u/5/...` and shows "Sorry, unable to open the file". The page now lives on GitHub Pages and calls the script with `fetch` (no cookies, so no account switching). Opening the old /exec link shows "The Kata Tracker has moved" with a button to the new address (keeping `?kata=` and `?from=`).

## API (`Code.gs`)

- Every call is `{action, a, t, p, h}` → `{ok, result}` or `{ok:false, error}`, sent as a `text/plain` POST (no CORS preflight) or, as a fallback, `GET ?api=rpc&callback=fn&…` answered as JavaScript `fn({ok,…})` (Gary's Android Chrome never gets fetch replies from Apps Script; the page switches after one failure). `a` = JSON text of the arguments, `t` = phone clock (ms, must be within 15 min).
  - `signIn`: `h` = SHA-256(`t:` + SHA-256(`ska-kata:` + CODE)) → `{p, k, name, level}`. `p` is the session (name, code check, 400-day expiry, base64), `k` = HMAC of `p` with `TOKEN_SECRET`, kept on the phone (`kt.session`, or sessionStorage if "Keep me signed in" is off).
  - Signed calls send `p` and `h` = SHA-256(`t:k:action:a`), so no code, password or key is ever in an address. The level is read fresh from the Access tab on every call. Errors starting `SIGNED_OUT:` make the page sign out.
  - `getData` (signed out or in): only what that level may see (see the table). Members get `members`/`progress` for themselves and linked family, `myRequests`, `myLinks`; moderators also `requests`, `recent`, `log` (newest 600 Log rows: time, member, kata, status, by); admins also `linkRequests`, `access`, `sheetUrl`.
  - Member: `requestChange(member, kata, to, note)`, `withdrawRequest(id)`, `requestLink(name)`. Moderator: `saveStatus(member, kata, status)`, `saveMany([[member, kata, status], …])` (up to 40; the page sends 15 at a time and falls back to `saveStatus` if the script is older), `decide(id, 'Approved'|'Declined')`, `undoDecision(id)`. Admin: `setLevel`, `makeCode`, `removeCode`, `addPerson`, `removeFamily`, `setPassword(false)`.
  - 10 wrong codes/passwords pause sign-in for 15 min. `clientLog` (sent by `sendBeacon`) writes what failed to the Executions log (look for "Kata Tracker page problem").
- `GET ?api=summary`: every kata with rank belt, Learned at belt and how many active members still need it (counts only). Used by the SKA Lesson Planner.
- `POST {action:'plannerMembers', key}` (Oct 21): active members' names and belts, for tagging class notes in the SKA Lesson Planner. Only answers when `key` matches Script Property `PLANNER_KEY` (menu **Kata Tracker → Show the Lesson Planner key** makes and shows it; Gary pastes it into the planner's menu **Connect to the Kata Tracker…**). Called by the planner's script, never from a phone. Nothing else (no progress, no notes) is shared. `plannerMembers_`, `plannerKey_`, `menuPlannerKey_`.

## Sheet

- **Kata**: Order, Kata, English Translation, Category (Solo / Multi-person / Weapon), Belt (= rank), Notes, **Learned at** (the belt the Karate Instructor Handbook v2.3 expects it learned at; "Blue/Purple" is the shared list; blank = not required for grading).
- **Members**: Name, Belt, Active (No hides someone without losing history), Notes. Juniors are listed by initial + surname on purpose.
- **Progress**: one row per member, one column per kata (A Member, B Belt via ARRAYFORMULA). New members/kata get rows/columns automatically, or via the sheet menu **Kata Tracker → Sync progress**.
- **Log**: every change from the app (time, member, kata, status, who; approvals end in "(request)").
- **Access** (made automatically): Name, Level (Member/Moderator/Admin), Code hash, Code made, Family (comma list of members this code also sees), Last signed in, Notes. People without a row are Members with no code. Deleting a row signs that person out.
- **Requests** (made automatically): ID, Time, Type (Kata / Family), Member, Kata, From, To, Note, Sent by, State (Waiting / Approved / Declined / Withdrawn), Decided by, Decided at, Was (status before an approval, for Undo).
- **Settings**: Dojo name (B2), Instructor password (B3), statuses in D2:D10 (Learning, Knows, Proficient; anything after the first counts as knowing), belts with colours from row 7, notes in column F.

## App (`index.html`, one file)

- Look (Gary's choices): same as the SKA Lesson Planner (red #C8102E header with the dojo logo, black secondary, M PLUS Rounded 1c + Nunito Sans) on a light grey page (#ECECEA) with white cards. No dark mode.
- Two layouts from one page (`wide()` = window at least 900 px, e.g. inside the dojo's Wix page): phone = red header + bottom tabs; wide = slim white top bar with every screen, pages up to 1,240 px, and an "open in its own tab" button when inside a frame. Mock-ups: the "Kata Tracker desktop" Design canvas (desktop row and Phone row).
- Tabs by level: signed out = Kata (sign-in card on top, no tab bar); Member = **My kata**, **Kata**; Moderator = **Home/Overview**, **Members**, **Kata**, **Grid**, **Readiness** in the bottom bar, with **Requests** as the speech-bubble header button (badge); Admin also gets **Access** (in the account panel on phones, in the top bar on wide screens; badge for family link requests).
- **Overview**: active members, learning right now, kata learned this month (from `log`), requests waiting; members by belt; requests (wide only); currently learning (tap a kata to see who); recent changes. No readiness here (Gary: readiness lives only on Readiness).
- **Members**: simple list (table on wide: belt, kata known, learning, last change), belt chips, sort (default belt highest first, then **last name**; also belt lowest first, last name, most kata known; remembered as `kt.msort`). A member opens beside the list on wide, as a page on phones: Learning/Knows/Proficient counts and their kata with status buttons (are you sure + Undo). No readiness here.
- **Grid**: members × kata. Filters (collapsible on wide, a bottom sheet on phones; remembered as `kt.grid`): member name, belts, pick individuals, sort; kata name, Solo/Multi-person/Weapon, required for grading, belt by Learned at or Rank, arrange by section → family → belt (default) / section → belt / belt / kata list order. Family = name without the trailing Shodan/Nidan/…/Dai/Sho. Tap a square to step blank → L → K → P; edits are outlined until one **Save** (Undo after), Discard drops them.
- **Readiness** (was "Ready to grade"): three status tiles (ready / one kata away / still working), by belt, kata to focus on, and members grouped by status with their missing kata as chips; tiles, belts and kata all filter the list. Every kata whose Learned at belt is at or below the member's belt must be Knows/Proficient. White and Black belts have no check. Empi Yonin Dori is ranked Purple but learned at Green.
- **Kata** tab (Gary's choice): split into **Solo kata**, then **Multi-person kata**, then **Weapon kata** (then any other type), each grouped by expected belt (Learned at if set, else rank); the chips narrow it. Moderators see "N know"; members see their own status pill. Kata page: tap Learning / Knows / Proficient (tap again to clear); the "Still need it" list stays fixed while open.
- Opens instantly from the last copy (`kt.data`), then refreshes. Back button: screens and panels are history steps.
- Lesson Planner link: `?kata=<name>&from=planner` opens that kata, asks a moderator to sign in if needed (stays on the kata after), and shows "Back to the lesson plan" (closes the tab, else goes to the planner).
- Cached data (`kt.data`) is only reused for the same signed-in person, and signing out drops everything but the kata list. The old `kt.pin` is wiped on load.

## Changing things

- Browser: Gary has several Chrome instances connected; the one signed in to garyluo.gs@gmail.com, GitHub (Dailuo-source) and Cloudflare is **GARYMAIN**.
- Page: edit `index.html`, commit, push to `main`; GitHub Pages publishes in about a minute.
- Hosting note: Gary's apps normally use Cloudflare Pages (Android won't install two apps from one site). This one went on GitHub Pages because the Claude extension can't open dash.cloudflare.com and Gary was away from his desktop. Pantry Pal is also on dailuo-source.github.io, so before making this an installable app, move it to Cloudflare Pages (project `ska-kata-tracker`, connect this repo, no build) and update `SITE_URL` in Code.gs and `KATA_SITE` in the Lesson Planner.
- Code.gs: paste into the script project and redeploy (**Deploy → Manage deployments → pencil → New version**; the /exec URL stays the same). Through Claude in Chrome: open the project, set `monaco.editor.getModels()[0]` to the raw GitHub `Code.gs` (fetch by commit SHA), Ctrl+S, redeploy. Reading code out of Monaco needs chunks under ~1,000 characters with `=`/`;`/`&`/`?` swapped out, or the extension blocks the output.
- Commits use author `Claude <noreply@anthropic.com>`.
- Testing (harness not in the repo, because its test data has real member names): `gasmock.js` (a Node stand-in for SpreadsheetApp/Utilities/etc. that runs the real Code.gs on data from the live sheet) plus Playwright with `script.google.com` routed to it, covering all three levels, the temporary password, the fallback route and the planner link.

## Code map
| File | Lines | What's in it |
|---|---|---|
| `Code.gs` | 962 | entry (`doGet`, `doPost`, `run_`, `dispatch_`); security (`sha256Hex_`, `hmacHex_`, `codeHash_`, `checkClock_`, `failGate_`, `newSession_`, `signIn_`, `session_`); temporary password (`passwordOn_`, `signInPassword_`, `setPassword_`); levels (`rank_`, `need_`, `isMod_`, `isAdmin_`, `visibleNames_`); actions (`getData_`, `requestChange_`, `withdrawRequest_`, `requestLink_`, `saveStatus_`, `saveMany_`, `decide_`, `undoDecision_`, `setLevel_`, `makeCode_`, `removeCode_`, `addPerson_`, `removeFamily_`); sheet reads (`readLog_`, `readKata_`, `readMembers_`, `readProgress_`, `readAccess_`, `readRequests_`, `getSettings_`); `kataSummary_` (the planner's `?api=summary`); `syncProgress_`; menu (`onOpen`, `menuMakeCode_`, `menuSignOutAll_`, `menuPlannerKey_`); planner names (`plannerMembers_`, `plannerKey_`); `clientLog_` |
| `index.html` | 2171 | CSS (~14–400), markup (~402–421), one `<script>` (~422–2169) |

Inside the `index.html` script, search for:
- Transport: `request`, `call`, `viaFetch`, `viaScript`, `scriptGet`, `report`
- Storage and loading: `store`/`recall`, `sstore`/`srecall`, `cacheData`, `load`, `applyLink`
- Levels and tabs: `me`, `level`, `isMod`, `isAdmin`, `homeTab`, `tabList`, `barTabs`, `wide`, `render`, `renderHeader`, `renderNav`, `renderTabs`, `go`
- Belts and readiness: `belts`, `beltIndex`, `statusOf`, `stPill`, `expectedKata`, `readiness`, `stillNeed`
- Overview: `homeView`, `stat`
- Members: `membersView`, `memberRows`, `memberPanel`, `openMember`, `sortMembers`, `tally`; members' own: `memberDetail`, `memberKataRow`, `myKata`
- Grid: `gridView`, `gFilters`, `gBody`, `gLists`, `family`, `gStep`, `gSave`, `saveBatch`, `gRefresh`, `gChanged`
- Kata: `kataList`, `kataGroups`, `kataDetail`, `catChips`
- Requests: `openAsk`, `sendAsk`, `withdraw`, `openLink`, `requestsView`, `decideRequest`, `setProgress`
- Readiness: `readyView`
- Access (admin): `accessView`, `accessRows`, `openPerson`, `setLevel`, `makeCode`, `removeCode`, `openAddPerson`, `askPasswordOff`
- Sign-in: `signInForm`, `submitSignIn`, `saveSession`, `signOut`, `openAccount`
- Panels: `openSheet`, `closeSheet`, `openChooser`, `askChange`, `save`, `toast`; planner link `backToPlanner`

## Status
- Working: desktop/Wix layout and the new Overview, Members, Grid and Readiness screens; per-person access codes with Member / Moderator / Admin levels, requests and approvals, Ready to grade, fallback route for phones that never get fetch replies, Lesson Planner link.
- Open: paste the new Code.gs into the script and redeploy if not done (Overview's recent changes/this month and the Grid's one-call save need it; the page works without it); remove the TEMPORARY PASSWORD button and code once it's turned off; move to Cloudflare Pages before making it installable; later switch sign-in to the dojo website's.

## Changelog (latest first, keep about 10 lines)
- 2026-10-21: Desktop/Wix layout; new Overview, Grid and Readiness screens; simpler Members sorted by belt then last name; Code.gs adds `log` and `saveMany`
- 2026-10-18: Turned the handoff notes into a brief (read-first rules, code map, status, changelog)
- 2026-10-17: Switch to the script route when a fetch reply never arrives, and remember it
- 2026-10-17: Save a new access code before showing it
- 2026-10-17: Access levels: member codes, requests, moderators and admins
- 2026-10-17: Fallback route when a phone can't read fetch replies from the sheet
- 2026-10-17: Stay on the linked kata after unlocking
- 2026-10-17: Host on GitHub Pages for now
