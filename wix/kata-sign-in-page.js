/*
 * Page code for a small, hidden Wix page "kata-sign-in" (Members only, not in the site menu).
 * The tracker's own phone app sends people here to sign in; this sends them straight back
 * with a pass. Only people with "Phone app" turned on in the tracker's Access screen get in.
 * The return address is fixed below, so this page can't be used to send a pass anywhere else.
 * Put a text element #status on the page (e.g. "Signing you in to the Kata Tracker…").
 */
import { kataPass } from 'backend/kataTracker.web';
import wixLocationFrontend from 'wix-location-frontend';

const TRACKER = 'https://dailuo-source.github.io/SKA-Kata-Tracker/';

$w.onReady(async function () {
  try {
    const pass = await kataPass('phone');
    wixLocationFrontend.to(TRACKER + '#wixpass=' + encodeURIComponent(pass));
  } catch (err) {
    $w('#status').text = 'Couldn’t sign you in to the Kata Tracker. Make sure you’re logged in, then try again.';
  }
});
