/*
 * Kata Tracker sign-in: backend web module for the dojo's Wix site.
 * In the Wix editor (Dev Mode on): Backend → + → New Web Module, name it kataTracker.web.js, paste this.
 *
 * Makes a short "pass" that tells the Kata Tracker who the logged-in Wix member is. It's signed
 * with the secret KATA_TRACKER_KEY (Secrets Manager), the same key the tracker's sheet has as
 * the WIX_KEY script property (sheet menu Kata Tracker → Set up website sign-in…).
 * The key stays on Wix's server; the browser only ever sees the signed pass, which works once
 * and expires after 5 minutes.
 */
import { Permissions, webMethod } from 'wix-web-module';
import { currentMember } from 'wix-members-backend';
import { secrets } from 'wix-secrets-backend.v2';
import { elevate } from 'wix-auth';
import crypto from 'crypto';

const getSecretValue = elevate(secrets.getSecretValue);
let cachedKey = null;

async function trackerKey() {
  if (!cachedKey) {
    const res = await getSecretValue('KATA_TRACKER_KEY');
    cachedKey = typeof res === 'string' ? res : res.value;
  }
  return cachedKey;
}

/** via: 'wix' (the tracker embedded on the site) or 'phone' (the tracker's own app). */
export const kataPass = webMethod(Permissions.SiteMember, async (via) => {
  const m = await currentMember.getMember({ fieldsets: ['FULL'] });
  const cd = m.contactDetails || {};
  const name = [cd.firstName, cd.lastName].filter(Boolean).join(' ') || (m.profile && m.profile.nickname) || '';
  const payload = {
    id: m._id,
    name,
    email: m.loginEmail || '',
    via: via === 'phone' ? 'phone' : 'wix',
    exp: Date.now() + 5 * 60 * 1000,
    n: crypto.randomBytes(16).toString('hex')
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', await trackerKey()).update(body).digest('hex');
  return body + '.' + sig;
});
