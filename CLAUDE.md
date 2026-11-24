# SKA Kata Tracker — Brief

> **Claude: read this first.** Open only the files a change touches; use the code map to jump to a function.
> `web/index.html` (~150 KB) and `Code.gs` (~38 KB) are large: search for a function name (e.g. `grep -n "function render" web/index.html`) and read just that function.
> At the end of a work session, update **Status** and add one line to **Changelog** (keep about 5). Keep **For Gary** current too: tick off (delete) what's done, add each step Gary must do himself (deploy, sheet menus, settings, checks). App Atlas reads Status, For Gary and Changelog to show where each app is.

Tracks which kata each member of **Scarborough Academy of Karate (SKA)** knows. Sits in the dojo's Wix site and works on phones (Gary: Samsung Android, Chrome).

## Where things live

| Piece | Location |
| --- | --- |
| Live app | https://dailuo-source.github.io/SKA-Kata-Tracker/ (GitHub Pages from `main`, no build; only `web/` is published, by `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions)). Never put Gary's full name in a web address |
| Database | Google Sheet **S.A. Karate Kata Tracker** (garyluo.gs@gmail.com), id `1QYVdiW5kZ5j-EvSQzZJ-GE12ZqwY2OUgTsSIzIloiHk` |
| Backend | Apps Script **Karate Kata List** bound to the sheet (id `111lCaHWu0gtPF8-jiEXuhYeEqizKrjg1Kh4eybj7NU7gigJ48_1eN8xD`); source is `Code.gs`. Web app: `https://script.google.com/macros/s/AKfycbwnmXKngbUjC-NAThAD_s7R2JdaKGX5e9R3cjJYdQlkEoWbe84nbdILOKVVsGiRbIlpqw/exec` (Execute as Gary, Anyone) |

The page is on GitHub Pages (not served by Apps Script) because multi-account phones get rewritten to `/macros/u/N/` and fail; it calls the script with `fetch` (no cookies). The old /exec link shows "The Kata Tracker has moved".

## Access levels (Code.gs enforces them; the page only follows)

| Who | Sees and does |
| --- | --- |
| Signed out | Kata list only (no names, no counts) |
| **Member** | Own kata (plus linked family); **asks** for Learning / Knows / Proficient with a note; can withdraw; asks to link family. Never sees others or readiness |
| **Moderator** | Members, Kata, Grid, Overview, Requests (approve/decline + Undo); changes statuses. **No Readiness** |
| **Instructor** | Everything except Access (moderator screens + **Readiness** + **Add member**) |
| **Admin** | Everything, plus **Access**: levels, access codes, family links, add people, turn off the temporary password |

- Sign-in: personal **access code** (6 chars like `K7P-4QX`, no 0/O/1/I/L). Sign-in checks `SHA-256("ska-kata:" + CODE)` (Code hash). Since Oct 22 the code itself is also saved in the Access tab's **Code** column (Gary's choice, so a lost code can be given out again); admins see it in Access (person panel, Copy). Codes made before then show "can't be shown" until a new one is made. Only admins get `access` or `sheetUrl` (the "Open the sheet" link). New/removed code signs that person out. Sheet menu **Kata Tracker → Make an access code…** also makes one. **Sign everyone out** rotates `TOKEN_SECRET`. Gary later wants the dojo website's sign-in instead.
- Can't remove or demote the last admin who has a code.
- **Dojo website sign-in (Wix, Nov 2026, replacing access codes).** The Wix site's backend (`wix/backend/kataTracker.web.js`) signs a 5-minute, single-use pass for the logged-in Wix member with secret `KATA_TRACKER_KEY` = Script property `WIX_KEY` (sheet menu **Set up website sign-in…**). Pass = base64url(JSON `{id,name,email,via,exp,n}`) + `.` + hex HMAC-SHA256. Inside the Wix page the tracker posts `{kt:'hello'}` to the parent and gets `{kt:'pass'}` back (`wix/tracker-page.js`, embed ID `#kataTracker`); the phone app goes to the hidden Wix page `kata-sign-in` (`WIX_SIGNIN_URL`), which returns to `#wixpass=…`. `wixSignIn` finds the Access row by **Wix ID**; a first visit makes a Member row named so it can't match a student (e.g. "Maya Chen (website)", Notes "From the website"): seeing any kata needs an admin-approved "Connect to a member" (Family) request. Someone still on an access code inside the Wix page is offered **Connect** (`connectWix`), which keeps their level and folds in a stray website row. Sessions: `c` = `wx:`/`wp:` + hash of the Wix ID. **Phone app** (outside the website) only for rows with Phone app = Yes (Gary's choice: hidden from most people because of the dojo's phone policy); turning it off signs that phone out. "Open in its own tab" only shows for them. Setup steps for Gary/the site owner: `wix/SETUP.md` (needs a Wix role with Edit Site; Gary isn't the owner).
- **Kata pictures** (Nov 23): moderators and up **see** a kata's slideshow; instructors and admins add, reorder, caption and remove. Members and signed-out visitors never get them (Gary's choice: the photos may show members).
- **Ask for more access:** anyone signed in can ask for a higher level (Request type **Level**); admins approve in Access (Undo restores the old level).
- **TEMPORARY PASSWORD**: Settings B3 still signs in as Moderator until an admin taps **Turn it off** (Script Property `PASSWORD_OFF` = 1). To be removed later: search both files for `TEMPORARY PASSWORD`.

## API (`Code.gs`)

- Every call is `{action, a, t, p, h}` → `{ok, result}` / `{ok:false, error}`, as a `text/plain` POST, or fallback `GET ?api=rpc&callback=fn&…` (JSONP-style, `<script crossOrigin='anonymous'>`; Gary's Android Chrome never gets fetch replies, so the page switches after one failure and returns to fetch when it works). `a` = JSON args, `t` = phone clock (ms, within 15 min).
- `signIn`: `h` = SHA-256(`t:` + SHA-256(`ska-kata:` + CODE)) → `{p, k, name, level}`; `p` = session (400 days), `k` = HMAC of `p` with `TOKEN_SECRET`, stored as `kt.session` (sessionStorage if "Keep me signed in" is off). Signed calls send `p` and `h` = SHA-256(`t:k:action:a`); no secret is ever in a URL. Level is re-read from Access every call. `SIGNED_OUT:` errors sign the page out.
- `getData`: only what the level may see. Members: `members`/`progress` (self + family), `myRequests`, `myLinks`; moderators add `requests`, `recent`, `log` (newest 600); admins add `linkRequests`, `access`, `sheetUrl`.
- Unsigned: `wixSignIn(pass)`. Member: `requestChange`, `withdrawRequest`, `requestLink`, `askLevel(level, note)`, `connectWix(pass)` (code sessions only). Moderator: `saveStatus`, `saveMany` (≤40; page sends 15, falls back to `saveStatus`), `decide`, `undoDecision`. Instructor: `addMember(name, belt)` (appends to Members with Active = Yes and a note, adds the Progress row; refuses duplicates and says when one is set to Active = No). Admin: `setLevel`, `setPhoneApp(name, on)`, `makeCode`, `removeCode`, `addPerson`, `removeFamily`, `setPassword(false)`.
- Pictures: `getData` gives moderators `pictures` = `{kata: [{id, cap, w, h}]}` in movement order (the page shows nothing picture-related until this key exists). Moderator: `getPictures(ids ≤4)` → `{id: base64 JPEG}`, `picDone(up)`. Instructor: `addPicture(kata, up, n, w, h, caption, data, key)` (whole picture in `data`, or `n` pieces sent first with `picPart(key, i, data)`, kept 1 h in the script cache), `orderPictures(kata, ids)`, `captionPicture(id, text)`, `removePicture(id)` (file goes to the Drive bin). `up` is the page's own ID for an upload: the same ID is only ever added once, so retries are safe. Pictures travel as web-safe base64; only JPEGs under 3 MB are accepted; 150 a kata.
- 10 wrong codes pause sign-in 15 min. `clientLog` (via `sendBeacon`) logs "Kata Tracker page problem" to Executions.
- `GET ?api=summary`: kata with rank, Learned at and count still needing it (counts only), for the SKA Lesson Planner.
- `POST {action:'plannerMembers', key}`: active members' names and belts for the planner; only if `key` = Script Property `PLANNER_KEY` (menu **Show the Lesson Planner key**). Nothing else is shared.

## Sheet

- **Kata**: Order, Kata, English Translation, Category (Solo / Multi-person / Weapon), Belt (= rank), Notes, **Learned at** (handbook belt; "Blue/Purple" shared; blank = not required).
- **Members**: Name, Belt, Active (No hides, keeps history), Notes. Juniors are initial + surname on purpose.
- **Progress**: row per member, column per kata (A Member, B Belt via ARRAYFORMULA). Menu **Sync progress** adds missing rows/columns.
- **Log**: every app change (time, member, kata, status, who; approvals end "(request)").
- **Access** (auto): Name, Level, Code hash, Code made, Family, Last signed in, Notes, Code, Wix ID, Email, Phone app (missing headers are added automatically). No row = Member without a code. Deleting a row signs them out.
- **Requests** (auto): ID, Time, Type (Kata / Family / Level), Member, Kata, From, To, Note, Sent by, State, Decided by, Decided at, Was (for Undo).
- **Pictures** (auto): ID, Kata, Order, File ID, Caption, Width, Height, Added by, Added at. One row per picture; a movement's number is its place by Order within the kata (never stored as a label). Files are private in Gary's Drive folder **S.A. Karate Kata Tracker pictures** (Script property `PICS_FOLDER`; sheet menu **Set up kata pictures…** makes it and shows the link). The script only reads or bins files that sit in that folder. Change pictures in the app, not in Drive.
- **Settings**: Dojo name B2, password B3, statuses D2:D10 (anything after the first counts as knowing), belts with colours from row 7.

## App design rules (`index.html`, one file)

- Look: like the SKA Lesson Planner (red #C8102E header with dojo logo, black secondary, M PLUS Rounded 1c + Nunito Sans) on light grey #ECECEA with white cards. No dark mode.
- `wide()` (≥900 px, e.g. inside Wix): slim white top bar, pages fill the full width (no max-width), no "Kata Tracker" label when framed (`body.framed`). On the dojo site it's a sub-page of **Dojo members** under the heading "S.A. Karate Kata Tracker". Phone: red header + bottom tabs.
- Tabs: signed out = Kata only. Member = **My kata**, **Kata**. Moderator = **Members** (landing), **Kata**, **Grid**, **Overview**. Instructor/Admin add **Readiness** (higher-level screens on the right). **Requests** = speech-bubble header button with badge. Admin **Access** in the account panel (phone) / top bar (wide).
- Readiness lives only on Readiness (not Overview or Members). Rule: every kata with Learned at ≤ member's belt must be Knows/Proficient; White and Black belts have no check; Empi Yonin Dori is ranked Purple but learned at Green.
- Members: default sort belt highest first, then **last name** (`kt.msort`). Status changes ask "are you sure" + Undo.
- **Ticking several** (moderators and up): a kata's page has a tick box per member, a member's page one per kata (same 22px box everywhere, also used by "Keep me signed in"). Ticking shows a dark bar with the statuses + Clear; one confirm, saved with `saveMany`, Undo. Ticks clear when you leave the page or the row leaves the list.
- Compact layout (Gary keeps asking for less vertical space). Every tap gets a squish and a ring at the finger (`pointerdown` handler; the ring sits on `<body>` so it survives a redraw).
- Grid: tap steps blank → L → K → P; edits outlined until one **Save** (Undo after). Filters remembered as `kt.grid`. Family = name without trailing Shodan/Nidan/…/Dai/Sho.
- Kata tab: **Solo**, then **Multi-person**, then **Weapon**, each grouped by Learned at (else rank).
- Opens from cache `kt.data` (only for the same signed-in person); sign-out drops all but the kata list. Old `kt.pin` is wiped on load. Screens and panels are history steps.
- **Kata pictures**: a **Movements** card on a kata's page (moderators and up), above the status tiles; it folds (`kt.picopen`). One picture at a time with its number in a red badge, "3 of 21 · caption", arrows / swipe / arrow keys, Play (3 s a picture) and full screen (a history step). Pictures load three at a time through the script and stay in memory only. Instructors and admins get **Add pictures** (several at once go in file-name order; each is shrunk to a JPEG on the phone, 1280 px, or 1080 px on the address route) and **Edit** (caption, up/down, remove with a second tap). Sending: one POST where fetch works; otherwise a POST without reading the reply then `picDone`, and failing that small pieces through the address route (piece size halves if an address is too long; `kt.picpart`/`kt.picpost` in sessionStorage).
- Planner link: `?kata=<name>&from=planner` opens that kata (sign-in if needed) with "Back to the lesson plan".

## Changing things

- Page: edit `web/index.html`, commit, push to `main` (Pages publishes in ~1 min).
- Code.gs: paste into the script project, **Deploy → Manage deployments → pencil → New version** (URL unchanged). Via Claude in Chrome (instance **GARYMAIN**): set `monaco.editor.getModels()[0]` to the raw GitHub `Code.gs` by commit SHA, Ctrl+S, redeploy. Reading from Monaco needs chunks under ~1,000 chars with `=`/`;`/`&`/`?` swapped out.
- Before making it installable, move to Cloudflare Pages (project `ska-kata-tracker`; Pantry Pal shares this github.io origin) and update `SITE_URL` in Code.gs and `KATA_SITE` in the Lesson Planner.
- Commits use author `Claude <noreply@anthropic.com>`.
- Test harness (`gasmock.js` + Playwright) is not in the repo: its data has real member names.

## Deploying Code.gs

- Web app deployment ID: `AKfycbwnmXKngbUjC-NAThAD_s7R2JdaKGX5e9R3cjJYdQlkEoWbe84nbdILOKVVsGiRbIlpqw`. Always update this deployment so the /exec URL never changes.
- From this folder, `.clasp.json` points clasp at the script project (rootDir is the repo root, where `Code.gs` is):
  ```
  clasp push
  clasp deploy -i AKfycbwnmXKngbUjC-NAThAD_s7R2JdaKGX5e9R3cjJYdQlkEoWbe84nbdILOKVVsGiRbIlpqw -d "what changed"
  ```
- Never run `clasp deploy` without `-i`: that creates a new deployment with a new /exec URL. `clasp deployments` lists them.

## Code map
| File | Lines | What's in it |
|---|---|---|
| `Code.gs` | 1386 | entry (`doGet`, `doPost`, `run_`, `dispatch_`); security (`sha256Hex_`, `hmacHex_`, `codeHash_`, `checkClock_`, `failGate_`, `newSession_`, `signIn_`, `session_`); temp password (`passwordOn_`, `signInPassword_`, `setPassword_`); levels (`rank_`, `need_`, `isMod_`, `isAdmin_`, `visibleNames_`); actions (`getData_`, `requestChange_`, `withdrawRequest_`, `requestLink_`, `saveStatus_`, `saveMany_`, `decide_`, `undoDecision_`, `setLevel_`, `makeCode_`, `removeCode_`, `addPerson_`, `removeFamily_`); reads (`readLog_`, `readKata_`, `readMembers_`, `readProgress_`, `readAccess_`, `readRequests_`, `getSettings_`); `kataSummary_`; `syncProgress_`; menu (`onOpen`, `menuMakeCode_`, `menuSignOutAll_`, `menuPlannerKey_`); `plannerMembers_`, `plannerKey_`; `clientLog_`; pictures (`picsRoot_`, `picFile_`, `readPictures_`, `picturesByKata_`, `picPart_`, `picDone_`, `addPicture_`, `getPictures_`, `picRenumber_`, `orderPictures_`, `captionPicture_`, `removePicture_`, `menuPictures_`) |
| `web/index.html` | 3056 | CSS (~14–488), markup (~490–510), main `<script>` (~511–2943), then the motion pack |

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
- Access: `accessView`, `accessRows`, `openPerson`, `setLevel`, `makeCode`, `removeCode`, `openAddPerson`, `askPasswordOff`, `decideLevel`
- Website sign-in: `wixHello`, `usePass`, `wixConnect`, `wixSignedIn`, `openAskLevel`, `sendAskLevel` (Code.gs: `readPass_`, `wixSignIn_`, `connectWix_`, `websiteName_`, `askLevel_`, `setPhoneApp_`, `menuWebsite_`)
- Sign-in: `signInForm`, `submitSignIn`, `saveSession`, `signOut`, `openAccount`
- Panels: `openSheet`, `closeSheet`, `openChooser`, `askChange`, `save`, `toast`, `backToPlanner`
- Motion: `motionOn`, `foldSnap`, `foldPlay`, `foldBox`, `foldPanel`, `slideOpen`, `slideShut`, `panelOpen`, `panelShut`, `riseBelowSwitch`, `picTurn`, `picRowsSnap`, `picRowsPlay`
- Kata pictures: `pic` (state), `hasPics`, `picsOf`, `picsCard`, `picPaint`, `picPump`, `picGo`, `picPlayToggle`, `picFull`, `picShrink`, `picSend`, `picBlind`, `picAsk`, `picParts`, `picAdd`, `openPics`, `picMove`, `picCaption`, `picRemove`, `picSet`
- Ticking several: `bulk`, `bulkCtx`, `cbx`, `selBar`, `bulkToggle`, `renderBulk`, `bulkAsk`, `saveChanges` (shared with `gSave`)

## Status
- Working: all screens, per-person access codes with four levels, requests and approvals, Readiness, phone fallback route, Lesson Planner link, Add member, ticking several rows to set one status. Script version 18 (2026-11-23).
- Built, not live yet: dojo website sign-in (Code.gs deployed as v17; dormant until `WIX_KEY` exists).
- Live, not yet tried by a person: **kata pictures** (Nov 23). Code.gs is deployed as script version 18, the Drive permission is granted and the pictures folder exists (`PICS_FOLDER` set). Checked: the live script answers and gives signed-out callers no `pictures`. Adding, viewing, reordering and removing pictures have not been tried in a browser or on a phone (syntax and lint checked; the script's picture functions run against a stand-in sheet). A later Code.gs change that needs a new Google permission must be approved **before** it is deployed (run any sheet menu item), or the live tracker stops answering until it is.
- Open, in order: (1) Gary: the Wix steps in `wix/SETUP.md` (his Wix role needs Edit Site, or the owner helps); (2) everyone with a level connects their website account; (3) point the Lesson Planner's tracker links (`KATA_SITE`) at the Wix Kata Tracker page (it passes `?kata`/`?add` through), since most people won't have the phone app; (4) **remove access codes and the TEMPORARY PASSWORD completely**: `signIn_`, `signInPassword_`, `makeCode_`, `removeCode_`, `menuMakeCode_`, code columns/UI, the code branch in `session_`, `connectWix_` and the page's code form; (5) move to Cloudflare Pages before the phone app is shared (update `TRACKER` in the two Wix page files too).

- Lesson Planner **Add a new student**: `?add=member&from=planner` opens Members and the Add a member form (asks for an instructor/admin code first if needed); after adding it offers **Add another** / **Back to the lesson plan** (Oct 30, page only).

## For Gary

Steps only Gary can do (App Atlas shows these as his to-dos). One line each; delete a line once it's done.

- [ ] Look at the new motion: folds sliding (Movements, Overview's Currently learning, Readiness's Kata to focus on; Grid filters on a computer) and pictures sliding; say if any is too slow, too quick or jumps
- [ ] Kata pictures: try it on the phone (add a few to one kata, reorder, caption, remove), then add each kata's movements
- [ ] Do the Wix steps in wix/SETUP.md
- [ ] Everyone with a level connects their dojo website account
- [ ] Point the Lesson Planner's tracker links at the Wix Kata Tracker page
- [ ] Remove access codes and the temporary password
- [ ] Move to Cloudflare Pages before sharing the phone app

## Motion

- **Motion pack** (`window.MP`, same copy in every app; Climb Buddy is the model): the `<script>` block before `</body>` in `web/index.html`, set up by the `MP.init({...})` line under it. Panels rise from the bottom and slip back down, toasts rise and slip away (setting `.hidden = true` plays the slip-away first, then hides; the app still reads `.hidden` as true at once), a new screen's pieces rise in one after another, and a new row on the same screen rises in. Unhurried (Gary wants animations easy to see); off under reduced motion. If a close function empties or removes the panel, do it after `MP.ms` (or use `MP.out(el, done)`), or the panel slides away empty.
- **Folds slide open and shut** (Nov 23, same as the SKA Lesson Planner: 380 ms, `foldSnap` before the redraw, `foldPlay` after, called from the click handler). Box folds resize their card (`slideOpen`/`slideShut`): Movements (`picfold`), Grid filters (`gfold`), Readiness "Kata to focus on" (`rfocus`). Panel folds open a row under their button (`panelOpen`/`panelShut`): Overview "Currently learning" (`lopen`), Grid "Pick members" (`gpickopen`). A new fold needs `aria-expanded` on its button, its data key in `FOLD_KEYS` and in the click handler's `fsnap` test, and a box or panel in `foldBox`/`foldPanel`.
- **Only the changed part moves** (as in Climb Buddy): switching whose kata on My kata keeps the switcher still and raises what's under it (`riseBelowSwitch`). Typing a caption never redraws the panel, so the next tap isn't swallowed.
- **Kata pictures**: the next/previous movement slides in from its side with the number popping (`picTurn`), a picture that has just loaded fades in (`pic.shown` stops a redraw from fading it again), full screen eases in and out, and in Edit the rows glide to their new places and a removed row slides off (`picRowsSnap`/`picRowsPlay`). All of it is off when `MP.on` is false (reduced motion).

## Changelog (latest first, keep about 5 lines)
- 2026-11-23: Motion brought in line with the recent apps: folds slide open and shut, whose-kata switch only moves what changed, pictures slide between movements, Edit rows glide (page only, not tried in a browser)
- 2026-11-23: Deployed Code.gs as script version 18 (kata pictures) after granting the Drive permission; pictures folder made
- 2026-11-23: Kata pictures: a numbered slideshow per kata (moderators and up see it; instructors and admins add, reorder, caption, remove)
- 2026-11-12: Deployed Code.gs as script version 17 (dojo website sign-in, Phone app switch, Ask for more access)
- 2026-11-12: Motion pack: panels and toasts rise and slip away, new screens rise in, new rows rise in. no service worker

## Working efficiently
- Find code with search first, then read only the relevant lines. Don't read index.html top to bottom.
- Make small, targeted edits. Never regenerate a whole file.
- Don't open a browser to test unless I ask. I'll test on my phone.
- No subagents unless I ask.
- One task per session. I'll /clear between tasks.
