/*
 * Page code for the Kata Tracker page on the dojo's Wix site (set the page to Members only).
 * The page has one Embed → HTML element, set to "Website address", ID #kataTracker.
 * The tracker inside it says hello; this answers with a signed pass for the logged-in member,
 * so they're signed in without typing anything.
 */
import { kataPass } from 'backend/kataTracker.web';
import wixLocationFrontend from 'wix-location-frontend';

const TRACKER = 'https://dailuo-source.github.io/SKA-Kata-Tracker/';

$w.onReady(function () {
  const frame = $w('#kataTracker');

  // Lesson Planner links can point here with ?kata=… or ?add=member; pass them on.
  const q = wixLocationFrontend.query || {};
  const keep = ['kata', 'from', 'add'].filter((k) => q[k]).map((k) => k + '=' + encodeURIComponent(q[k]));
  frame.src = TRACKER + (keep.length ? '?' + keep.join('&') : '');

  frame.onMessage(async (event) => {
    const msg = event.data || {};
    if (msg.kt !== 'hello') return;
    try {
      frame.postMessage({ kt: 'pass', pass: await kataPass('wix') });
    } catch (err) {
      frame.postMessage({ kt: 'nopass', error: String((err && err.message) || err) });
    }
  });
});
