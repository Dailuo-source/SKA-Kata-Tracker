# SKA Kata Tracker — Brief

> **Claude: read this first.** Open only the files a change touches; use the code map to jump to a function.
> `index.html` (~150 KB) and `Code.gs` (~38 KB) are large: search for a function name (e.g. `grep -n "function render" index.html`) and read just that function.
> At the end of a work session, update **Status** and add one line to **Changelog** (keep about 5).

Tracks which kata each member of **Scarborough Academy of Karate (SKA)** knows. Sits in the dojo's Wix site and works on phones (Gary: Samsung Android, Chrome).

## Where things live

| Piece | Location |
| --- | --- |
| Live app | https://dailuo-source.github.io/SKA-Kata-Tracker/ (GitHub Pages from `main`, root, `.nojekyll`, no build). Never put Gary's full name in a web address |
| Database | Google Sheet **S.A. Karate Kata Tracker** (garyluo.gs@gmail.com), id `1QYVdiW5kZ5j-EvSQzZJ-GE12ZqwY2OUgTsSIzIloiHk` |
| Backend | Apps Script **Karate Kata List** bound to the sheet (id `111lCaHWu0gtPF8-jiEXuhYeEqizKrjg1Kh4eybj7NU7gigJ48_1eN8xD`); source is `Code.gs`. Web app: `https://script.google.com/macros/s/AKfycbwnmXKngbUjC-NAThAD_s7R2JdaKGX5e9R3cjJYdQlkEoWbe84nbdILOKVVsGiRbIlpqw/exec` (Execute as Gary, Anyone) |

The page is on GitHub Pages (not served by Apps Script) because multi-account phones get rewritten to `/macros/u/N/` and fail; it calls the script with `fetch` (no cookies). The old /exec link shows "The Kata Tracker has moved".

## Access levels (Code.gs enforces them; the page only follows)

| Who | Sees and does |
| --- | --- |
| Signed out | Kata list only (no names, no counts) |
| **Member** | Own kata (plus linked family); **asks** for Learning / Knows / Proficient with a note; can withdraw; asks to link family. Never sees others or readiness |
| **Moderator** | Members, Kata, Grid, Overview, Requests (approve/decline + Undo); changes statuses. **No Readiness** |
| **Instructor** | Everything except Access (moderator screens + **Readiness**) |
| **Admin** | Everything, plus **Access**: levels, access codes, family links, add people, turn off the temporary password |

- Sign-in: personal **access code** (6 chars like `K7P-4QX`, no 0/O/1/I/L). Shown once; only `SHA-256("ska-kata:" + CODE)` is stored. New/removed code signs that person out. Sheet menu **Kata Tracker → Make an access code…** also makes one. **Sign everyone out** rotates `TOKEN_SECRET`. Gary later wants the dojo website's sign-in instead.
- Can't remove or demote the last admin who has a code.
- **TEMPORARY PASSWORD**: Settings B3 still signs in as Moderator until an admin taps **Turn it off** (Script Property `PASSWORD_OFF` = 1). To be removed later: search both files for `TEMPORARY PASSWORD`.

## API (`Code.gs`)

- Every call is `{action, a, t, p, h}` → `{ok, result}` / `{ok:false, error}`, as a `text/plain` POST, or fallback `GET ?api=rpc&callback=fn&…` (JSONP-style, `<script crossOrigin='anonymous'>`; Gary's Android Chrome never gets fetch replies, so the page switches after one failure and returns to fetch when it works). `a` = JSON args, `t` = phone clock (ms, within 15 min).
- `signIn`: `h` = SHA-256(`t:` + SHA-256(`ska-kata:` + CODE)) → `{p, k, name, level}`; `p` = session (400 days), `k` = HMAC of `p` with `TOKEN_SECRET`, stored as `kt.session` (sessionStorage if "Keep me signed in" is off). Signed calls send `p` and `h` = SHA-256(`t:k:action:a`); no secret is ever in a URL. Level is re-read from Access every call. `SIGNED_OUT:` errors sign the page out.
- `getData`: only what the level may see. Members: `members`/`progress` (self + family), `myRequests`, `myLinks`; moderators add `requests`, `recent`, `log` (newest 600); admins add `linkRequests`, `access`, `sheetUrl`.
- Member: `requestChange`, `withdrawRequest`, `requestLink`. Moderator: `saveStatus`, `saveMany` (≤40; page sends 15, falls back to `saveStatus`), `decide`, `undoDecision`. Admin: `setLevel`, `makeCode`, `removeCode`, `addPerson`, `removeFamily`, `setPassword(false)`.
- 10 wrong codes pause sign-in 15 min. `clientLog` (via `sendBeacon`) logs "Kata Tracker page problem" to Executions.
- `GET ?api=summary`: kata with rank, Learned at and count still needing it (counts only), for the SKA Lesson Planner.
- `POST {action:'plannerMembers', key}`: active members' names and belts for the planner; only if `key` = Script Property `PLANNER_KEY` (menu **Show the Lesson Planner key**). Nothing else is shared.

## Sheet

- **Kata**: Order, Kata, English Translation, Category (Solo / Multi-person / Weapon), Belt (= rank), Notes, **Learned at** (handbook belt; "Blue/Purple" shared; blank = not required).
- **Members**: Name, Belt, Active (No hides, keeps history), Notes. Juniors are initial + surname on purpose.
- **Progress**: row per member, column per kata (A Member, B Belt via ARRAYFORMULA). Menu **Sync progress** adds missing rows/columns.
- **Log**: every app change (time, member, kata, status, who; approvals end "(request)").
- **Access** (auto): Name, Level, Code hash, Code made, Family, Last signed in, Notes. No row = Member without a code. Deleting a row signs them out.
- **Requests** (auto): ID, Time, Type (Kata / Family), Member, Kata, From, To, Note, Sent by, State, Decided by, Decided at, Was (for Undo).
- **Settings**: Dojo name B2, password B3, statuses D2:D10 (anything after the first counts as knowing), belts with colours from row 7.

## App design rules (`index.html`, one file)

- Look: like the SKA Lesson Planner (red #C8102E header with dojo logo, black secondary, M PLUS Rounded 1c + Nunito Sans) on light grey #ECECEA with white cards. No dark mode.
- `wide()` (≥900 px, e.g. inside Wix): slim white top bar, pages up to 1,240 px, "open in its own tab" when framed. Phone: red header + bottom tabs.
- Tabs: signed out = Kata only. Member = **My kata**, **Kata**. Moderator = **Members** (landing), **Kata**, **Grid**, **Overview**. Instructor/Admin add **Readiness** (higher-level screens on the right). **Requests** = speech-bubble header button with badge. Admin **Access** in the account panel (phone) / top bar (wide).
- Readiness lives only on Readiness (not Overview or Members). Rule: every kata with Learned at ≤ member's belt must be Knows/Proficient; White and Black belts have no check; Empi Yonin Dori is ranked Purple but learned at Green.
- Members: default sort belt highest first, then **last name** (`kt.msort`). Status changes ask "are you sure" + Undo.
- Grid: tap steps blank → L → K → P; edits outlined until one **Save** (Undo after). Filters remembered as `kt.grid`. Family = name without trailing Shodan/Nidan/…/Dai/Sho.
- Kata tab: **Solo**, then **Multi-person**, then **Weapon**, each grouped by Learned at (else rank).
- Opens from cache `kt.data` (only for the same signed-in person); sign-out drops all but the kata list. Old `kt.pin` is wiped on load. Screens and panels are history steps.
- Planner link: `?kata=<name>&from=planner` opens that kata (sign-in if needed) with "Back to the lesson plan".

## Changing things

- Page: edit `index.html`, commit, push to `main` (Pages publishes in ~1 min).
- Code.gs: paste into the script project, **Deploy → Manage deployments → pencil → New version** (URL unchanged). Via Claude in Chrome (instance **GARYMAIN**): set `monaco.editor.getModels()[0]` to the raw GitHub `Code.gs` by commit SHA, Ctrl+S, redeploy. Reading from Monaco needs chunks under ~1,000 chars with `=`/`;`/`&`/`?` swapped out.
- Before making it installable, move to Cloudflare Pages (project `ska-kata-tracker`; Pantry Pal shares this github.io origin) and update `SITE_URL` in Code.gs and `KATA_SITE` in the Lesson Planner.
- Commits use author `Claude <noreply@anthropic.com>`.
- Test harness (`gasmock.js` + Playwright) is not in the repo: its data has real member names.

## Code map
| File | Lines | What's in it |
|---|---|---|
| `Code.gs` | 962 | entry (`doGet`, `doPost`, `run_`, `dispatch_`); security (`sha256Hex_`, `hmacHex_`, `codeHash_`, `checkClock_`, `failGate_`, `newSession_`, `signIn_`, `session_`); temp password (`passwordOn_`, `signInPassword_`, `setPassword_`); levels (`rank_`, `need_`, `isMod_`, `isAdmin_`, `visibleNames_`); actions (`getData_`, `requestChange_`, `withdrawRequest_`, `requestLink_`, `saveStatus_`, `saveMany_`, `decide_`, `undoDecision_`, `setLevel_`, `makeCode_`, `removeCode_`, `addPerson_`, `removeFamily_`); reads (`readLog_`, `readKata_`, `readMembers_`, `readProgress_`, `readAccess_`, `readRequests_`, `getSettings_`); `kataSummary_`; `syncProgress_`; menu (`onOpen`, `menuMakeCode_`, `menuSignOutAll_`, `menuPlannerKey_`); `plannerMembers_`, `plannerKey_`; `clientLog_` |
| `index.html` | 2171 | CSS (~14–400), markup (~402–421), one `<script>` (~422–2169) |

Inside the `index.html` script, search for:
- Transport: `request`, `call`, `viaFetch`, `viaScript`, `scriptGet`, `report`
- Storage: `store`/`recall`, `sstore`/`srecall`, `cacheData`, `load`, `applyLink`
- Levels and tabs: `me`, `level`, `isMod`, `isAdmin`, `homeTab`, `tabList`, `barTabs`, `wide`, `render`, `renderHeader`, `renderNav`, `renderTabs`, `go`
- Belts and readiness: `belts`, `beltIndex`, `statusOf`, `stPill`, `expectedKata`, `readiness`, `stillNeed`
- Overview: `homeView`, `stat`
- Members: `membersView`, `memberRows`, `memberPanel`, `openMember`, `sortMembers`, `tally`, `memberDetail`, `memberKataRow`, `myKata`
- Grid: `gridView`, `gFilters`, `gBody`, `gLists`, `family`, `gStep`, `gSave`, `saveBatch`, `gRefresh`, `gChanged`
- Kata: `kataList`, `kataGroups`, `kataDetail`, `catChips`
- Requests: `openAsk`, `sendAsk`, `withdraw`, `openLink`, `requestsView`, `decideRequest`, `setProgress`
- Readiness: `readyView`
- Access: `accessView`, `accessRows`, `openPerson`, `setLevel`, `makeCode`, `removeCode`, `openAddPerson`, `askPasswordOff`
- Sign-in: `signInForm`, `submitSignIn`, `saveSession`, `signOut`, `openAccount`
- Panels: `openSheet`, `closeSheet`, `openChooser`, `askChange`, `save`, `toast`, `backToPlanner`

## Status
- Working: all screens, per-person access codes with four levels, requests and approvals, Readiness, phone fallback route, Lesson Planner link. Script version 14.
- Open: remove the TEMPORARY PASSWORD once it's off; move to Cloudflare Pages before making it installable; later switch to the dojo website's sign-in.

## Changelog (latest first, keep about 5 lines)
- 2026-10-22: Trimmed this brief
- 2026-10-21: Fallback route without cookies, falls back to fetch
- 2026-10-21: Instructor level; Readiness for instructors and admins only; Members is the landing screen (script version 14)
- 2026-10-21: Desktop/Wix layout; Overview, Grid and Readiness screens

## Working efficiently
- Find code with search first, then read only the relevant lines. Don't read index.html top to bottom.
- Make small, targeted edits. Never regenerate a whole file.
- Don't open a browser to test unless I ask. I'll test on my phone.
- No subagents unless I ask.
- One task per session. I'll /clear between tasks.
