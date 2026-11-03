# Signing in with the dojo website (Wix): setup

Nothing in this folder is published. These files get pasted into the dojo's Wix site.

## What you need on the Wix site

- A collaborator role with **Edit Site** permission (to add code), and **Publish** to test it live. Check under the site dashboard's **Roles & Permissions**. If your role doesn't have them, ask the site owner to add them or to do steps 2–4 with you.
- The Members Area (already there).

## Steps

1. **Make the key (Google Sheet).** Open the Kata Tracker sheet → menu **Kata Tracker → Set up website sign-in…**. Copy the key it shows. Leave the page address blank for now.
2. **Turn on Dev Mode (Wix editor).** Top bar → **Dev Mode → Turn on Dev Mode**.
3. **Add the secret (Wix dashboard).** **Developer Tools → Secrets Manager → Store Secret**. Name `KATA_TRACKER_KEY`, value = the key from step 1.
4. **Add the code (Wix editor, code panel).**
   - Backend → **+ → New Web Module** → name it `kataTracker.web.js` → paste `wix/backend/kataTracker.web.js`.
   - Open the Kata Tracker page. Its HTML embed: **Settings → Website address** = `https://dailuo-source.github.io/SKA-Kata-Tracker/`, and in the Properties panel set its ID to `kataTracker`. Paste `wix/tracker-page.js` into the page's code.
   - Make it a sub-page of **Dojo members** (Pages & Menu → drag it under Dojo members, after Dojo forum), named **Kata Tracker**, with the same permissions as the other Dojo members pages (approved members only).
   - Page layout to match the forum page: the big heading **S.A. Karate Kata Tracker** with a one-line description under it, then the embed, the same width as the forum's content (about 1,400 px in the editor) and 900–1,000 px tall. Inside the website the tracker hides its own "Kata Tracker" label, so the heading isn't repeated.
5. **Phone app page (only for you, for now).** Add a page `kata-sign-in`, hide it from the menu, Members only, with one text element (ID `status`, text "Signing you in to the Kata Tracker…"). Paste `wix/kata-sign-in-page.js` into its code. Publish, copy its address, then run the sheet menu **Set up website sign-in…** again and paste the address.
6. **Publish** the site.

## Then, in the tracker

1. Open the Kata Tracker page on the website. If you're still signed in with your access code there, the tracker offers to **connect your website account**: say yes. You keep Admin.
2. In **Access**, find yourself and turn on **Phone app** if you want to use the tracker on its own.
3. Other instructors and moderators do the same once, or you set their level after their first website visit (they appear as new Members, marked "Website").
4. When everyone who needs a level is connected, Claude removes access codes and the temporary password.

## If it breaks

- "Signing in with the dojo website isn't set up yet": the sheet has no key (step 1).
- "That website sign-in didn't work": the Wix secret doesn't match the sheet's key. Re-copy it.
- Nothing happens on the Wix page: check the embed's ID is `kataTracker` and that it uses **Website address**, not **Code**.
