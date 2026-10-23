/**
 * S.A. Karate Kata Tracker: the backend.
 * Bound to the "S.A. Karate Kata Tracker" Google Sheet (Extensions > Apps Script).
 * The page itself is hosted at SITE_URL and talks to this script through doPost
 * (or the ?api=rpc fallback). The old /exec link shows a "moved" page.
 *
 * Who sees what (Gary's rules):
 *   Signed out  – the dojo's kata list only.
 *   Member      – their own kata (and approved family members'); can ask for changes.
 *   Moderator   – everyone's kata, makes changes, approves requests (no Readiness).
 *   Instructor  – everything except Access (adds Readiness, adding members).
 *   Admin       – everything, plus access levels, access codes and family links.
 * People sign in with a personal access code (Access tab). The old shared instructor
 * password still works as Moderator access for now (see TEMPORARY PASSWORD below).
 *
 * Source of truth for this file: Code.gs in Dailuo-source/SKA-Kata-Tracker.
 */

var SITE_URL = 'https://dailuo-source.github.io/SKA-Kata-Tracker/';

var TAB = {
  KATA: 'Kata',
  MEMBERS: 'Members',
  PROGRESS: 'Progress',
  LOG: 'Log',
  SETTINGS: 'Settings',
  ACCESS: 'Access',
  REQUESTS: 'Requests'
};
// Code (Gary, Oct 22): the access code itself, so an admin can give it out again. Only admins see it in the app;
// anyone the sheet is shared with can see it on the Access tab.
var ACCESS_HEAD = ['Name', 'Level', 'Code hash', 'Code made', 'Family', 'Last signed in', 'Notes', 'Code'];
var REQ_HEAD = ['ID', 'Time', 'Type', 'Member', 'Kata', 'From', 'To', 'Note', 'Sent by', 'State', 'Decided by', 'Decided at', 'Was'];
var LEVELS = ['Member', 'Moderator', 'Instructor', 'Admin'];

var FIRST_KATA_COL = 3;          // Progress: A = Member, B = Belt (formula), C onward = kata
var MAX_SIGNIN_FAILS = 10;       // wrong codes/passwords before sign-in pauses
var LOCKOUT_SECONDS = 900;       // 15 minutes
var SESSION_DAYS = 400;
var CLOCK_SLACK_MS = 15 * 60 * 1000;
var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L
var TZ = 'America/Toronto';

/* ---------- Web app ---------- */

/**
 * ?api=summary: every kata with how many members still need it (counts only, no names),
 * read by the SKA Lesson Planner. ?api=rpc&callback=…: the fallback route (see rpc_).
 * Anything else: the "moved" page for old links.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.api === 'summary') {
    var out;
    try { out = { ok: true, kata: kataSummary_() }; }
    catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.api === 'rpc' && /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(p.callback || '')) {
    return ContentService.createTextOutput(p.callback + '(' + JSON.stringify(run_(p)) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  var q = [];
  ['kata', 'from'].forEach(function (k) { if (p[k]) q.push(k + '=' + encodeURIComponent(p[k])); });
  var url = SITE_URL + (q.length ? '?' + q.join('&') : '');
  var safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:48px auto;padding:0 20px;text-align:center">' +
    '<h1 style="font-size:22px;margin:0 0 8px">The Kata Tracker has moved</h1>' +
    '<p style="color:#444;margin:0 0 20px">It now lives at its own address.</p>' +
    '<a href="' + safe + '" target="_top" style="display:inline-block;background:#C8102E;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:24px">Open the Kata Tracker</a>' +
    '<p style="color:#666;font-size:13px;margin-top:16px">' + SITE_URL.replace(/^https:\/\//, '') + '</p></div>')
    .setTitle('Kata Tracker has moved')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * The page's API. Body (text/plain, so browsers skip the CORS preflight):
 * { action, a: JSON text of the arguments, p, t, h }   → { ok, result } or { ok:false, error }.
 */
function doPost(e) {
  var r;
  try { r = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { r = {}; }
  if (r && r.action === 'plannerMembers') {
    return ContentService.createTextOutput(JSON.stringify(plannerMembers_(r.key))).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify(run_(r))).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Both routes end here. Signed-in calls carry
 *   p = the session (from sign-in), t = the phone's clock (ms),
 *   h = SHA-256 of "t:key:action:a", where key is the session key the phone got at sign-in.
 * The key itself never travels again, so nothing secret is ever in an address, and an old
 * request can't be replayed after 15 minutes.
 */
function run_(r) {
  try {
    return { ok: true, result: dispatch_(r || {}) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

function dispatch_(r) {
  var action = str_(r.action);
  var aText = typeof r.a === 'string' ? r.a : '[]';
  var args = JSON.parse(aText || '[]');
  if (!Array.isArray(args)) throw new Error('Bad request.');

  if (action === 'clientLog') return clientLog_(args[0]);
  if (action === 'signIn') return signIn_(r.t, r.h);
  if (action === 'signInPassword') return signInPassword_(r.t, r.h, args[0]);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTabs_(ss);
  if (action === 'getData') {
    var s0 = null, signedOut = false;
    if (r.p) {
      try { s0 = session_(ss, r, action, aText); }
      catch (err) { if (/^SIGNED_OUT/.test(err.message)) signedOut = true; else throw err; }
    }
    var d = getData_(ss, s0);
    if (signedOut) d.signedOut = true;
    return d;
  }

  if (!r.p) throw new Error('SIGNED_OUT: Please sign in.');
  var s = session_(ss, r, action, aText);
  var fns = {
    saveStatus: [saveStatus_, 'Moderator'],
    saveMany: [saveMany_, 'Moderator'],
    addMember: [addMember_, 'Instructor'],
    requestChange: [requestChange_, 'Member'],
    withdrawRequest: [withdrawRequest_, 'Member'],
    requestLink: [requestLink_, 'Member'],
    decide: [decide_, 'Moderator'],
    undoDecision: [undoDecision_, 'Moderator'],
    setLevel: [setLevel_, 'Admin'],
    makeCode: [makeCode_, 'Admin'],
    removeCode: [removeCode_, 'Admin'],
    addPerson: [addPerson_, 'Admin'],
    removeFamily: [removeFamily_, 'Admin'],
    setPassword: [setPassword_, 'Admin']
  };
  var f = fns[action];
  if (!f) throw new Error('Unknown action.');
  need_(s, f[1]);
  return f[0].apply(null, [ss, s].concat(args));
}

/* ---------- Signing in ---------- */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('TOKEN_SECRET');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('TOKEN_SECRET', k); }
  return k;
}
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function sha256Hex_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hmacHex_(s) { return hex_(Utilities.computeHmacSha256Signature(s, secret_())); }
function normCode_(code) { return str_(code).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function codeHash_(code) { return sha256Hex_('ska-kata:' + normCode_(code)); }

function checkClock_(t) {
  t = Number(t);
  if (!t || Math.abs(Date.now() - t) > CLOCK_SLACK_MS) throw new Error('This phone’s clock looks wrong. Check the time and try again.');
}
function failGate_() {
  var fails = Number(CacheService.getScriptCache().get('signFails') || 0);
  if (fails >= MAX_SIGNIN_FAILS) throw new Error('Too many wrong tries. Sign-in is paused for 15 minutes.');
  return fails;
}
function failed_(fails, msg) {
  CacheService.getScriptCache().put('signFails', String(fails + 1), LOCKOUT_SECONDS);
  throw new Error(msg);
}

/** A new session for one person: p (sent with every call) and key (kept on the phone). */
function newSession_(name, check) {
  var p = Utilities.base64EncodeWebSafe(JSON.stringify({ n: name, c: check, e: Date.now() + SESSION_DAYS * 864e5 }), Utilities.Charset.UTF_8);
  return { p: p, k: hmacHex_(p) };
}

/** Sign in with an access code. h = SHA-256 of "t:" + SHA-256("ska-kata:" + CODE). */
function signIn_(t, h) {
  var fails = failGate_();
  checkClock_(t);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTabs_(ss);
  var rows = readAccess_(ss);
  var hit = null;
  rows.forEach(function (a) {
    if (!hit && a.hash && sha256Hex_(String(t) + ':' + a.hash) === str_(h).toLowerCase()) hit = a;
  });
  if (!hit) failed_(fails, 'That code didn’t work. Check it and try again.');
  CacheService.getScriptCache().remove('signFails');
  ss.getSheetByName(TAB.ACCESS).getRange(hit.row, ACCESS_HEAD.indexOf('Last signed in') + 1).setValue(new Date());
  var out = newSession_(hit.name, hit.hash.slice(0, 12));
  out.name = hit.name;
  out.level = hit.level;
  return out;
}

/* ===== TEMPORARY PASSWORD (Moderator access while everyone gets codes) =====
 * Gary's plan: remove this once moderators and admins have codes, so there's no
 * shared back door. To remove: delete signInPassword_, passwordOn_, setPassword_,
 * the 'pw:' branch in session_, the signInPassword/setPassword entries in dispatch_,
 * and the password parts of the page (search index.html for TEMPORARY PASSWORD). */
function passwordOn_() {
  return !!getSettings_().pin && PropertiesService.getScriptProperties().getProperty('PASSWORD_OFF') !== '1';
}
function pwTag_(pin) { return 'pw:' + sha256Hex_('pw:' + pin).slice(0, 12); }
function signInPassword_(t, h, name) {
  if (!passwordOn_()) throw new Error('The instructor password has been turned off. Ask an admin for your access code.');
  var fails = failGate_();
  checkClock_(t);
  var pin = getSettings_().pin;
  if (str_(h).toLowerCase() !== sha256Hex_(String(t) + ':' + pin)) failed_(fails, 'Wrong password.');
  CacheService.getScriptCache().remove('signFails');
  name = str_(name).slice(0, 40) || 'Instructor';
  var out = newSession_(name + ' (password)', pwTag_(pin));
  out.name = name + ' (password)';
  out.level = 'Moderator';
  return out;
}
function setPassword_(ss, s, on) {
  PropertiesService.getScriptProperties().setProperty('PASSWORD_OFF', on ? '0' : '1');
  return { passwordOn: passwordOn_() };
}
/* ===== end TEMPORARY PASSWORD ===== */

/**
 * Checks a signed-in call and returns who it is, with their level read fresh from the
 * Access tab (so a level change applies straight away). Making a new code, removing a
 * code or deleting the Access row signs that person out everywhere.
 */
function session_(ss, r, action, aText) {
  var bad = 'SIGNED_OUT: Please sign in again.';
  var p = str_(r.p);
  var data;
  try { data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p)).getDataAsString('UTF-8')); }
  catch (e) { throw new Error(bad); }
  if (!data || !data.n || !data.c || !(data.e > Date.now())) throw new Error(bad);
  checkClock_(r.t);
  var want = sha256Hex_(String(r.t) + ':' + hmacHex_(p) + ':' + action + ':' + aText);
  if (str_(r.h).toLowerCase() !== want) throw new Error(bad);

  if (String(data.c).indexOf('pw:') === 0) {
    if (!passwordOn_() || data.c !== pwTag_(getSettings_().pin)) throw new Error('SIGNED_OUT: The instructor password has changed or been turned off.');
    return { name: data.n, level: 'Moderator', password: true, family: [], hasRow: false };
  }
  var row = readAccess_(ss).filter(function (a) { return a.name === data.n; })[0];
  if (!row || !row.hash || row.hash.slice(0, 12) !== data.c) throw new Error(bad);
  return { name: row.name, level: row.level, password: false, family: row.family, hasRow: true };
}

function rank_(level) { return LEVELS.indexOf(level); }
function need_(s, level) {
  if (rank_(s.level) < rank_(level)) throw new Error('You don’t have access to do that.');
}
function isMod_(s) { return !!s && rank_(s.level) >= 1; }
function isAdmin_(s) { return !!s && rank_(s.level) >= 3; }

/** The members whose kata this person may see: everyone for moderators, else self + family. */
function visibleNames_(s, members) {
  if (!s) return [];
  if (isMod_(s)) return members.map(function (m) { return m.name; });
  var all = {};
  members.forEach(function (m) { all[m.name] = true; });
  return [s.name].concat(s.family).filter(function (n, i, arr) { return all[n] && arr.indexOf(n) === i; });
}

/** A note from a phone that couldn't read a reply (shows in Apps Script → Executions). */
function clientLog_(info) {
  console.log('Kata Tracker page problem: ' + JSON.stringify(info).slice(0, 3000));
  return true;
}

/* ---------- Reading ---------- */

/** Everything the page may show this person, in one call. */
function getData_(ss, s) {
  syncProgress_(ss);
  var settings = getSettings_();
  var out = {
    dojoName: settings.dojoName,
    belts: settings.belts,
    statuses: settings.statuses,
    kata: readKata_(ss, settings),
    members: [],
    progress: {},
    me: null,
    passwordOn: passwordOn_(),
    loadedAt: new Date().toISOString()
  };
  if (!s) return out;

  var members = readMembers_(ss);
  var names = visibleNames_(s, members);
  var progress = readProgress_(ss);
  out.members = members.filter(function (m) { return names.indexOf(m.name) !== -1; });
  names.forEach(function (n) { if (progress[n]) out.progress[n] = progress[n]; });
  out.me = { name: s.name, level: s.level, password: s.password, family: s.family, canLink: s.hasRow };

  var reqs = readRequests_(ss);
  var cutoff = Date.now() - 14 * 864e5;
  if (isMod_(s)) {
    out.requests = reqs.filter(function (q) { return q.type === 'Kata' && q.state === 'Waiting'; }).reverse();
    out.recent = reqs.filter(function (q) { return q.type === 'Kata' && (q.state === 'Approved' || q.state === 'Declined'); })
      .sort(function (a, b) { return b.decidedMs - a.decidedMs; }).slice(0, 12);
    out.log = readLog_(ss, names, 600);
  } else {
    out.myRequests = reqs.filter(function (q) {
      return q.type === 'Kata' && names.indexOf(q.member) !== -1 &&
        (q.state === 'Waiting' || (q.state === 'Declined' && q.decidedMs > cutoff));
    });
  }
  out.myLinks = reqs.filter(function (q) { return q.type === 'Family' && q.sentBy === s.name && q.state === 'Waiting'; })
    .map(function (q) { return q.member; });
  if (isAdmin_(s)) {
    out.linkRequests = reqs.filter(function (q) { return q.type === 'Family' && q.state === 'Waiting'; });
    out.access = accessList_(ss, members);
    out.sheetUrl = ss.getUrl();
  }
  return out;
}

/** Everyone who is, or could be, signed in: active members plus Access rows not on the list. */
function accessList_(ss, members) {
  var rows = readAccess_(ss);
  var byName = {};
  rows.forEach(function (a) { byName[a.name] = a; });
  var list = members.map(function (m) {
    var a = byName[m.name];
    delete byName[m.name];
    return person_(m.name, m.belt, true, a);
  });
  Object.keys(byName).forEach(function (n) { list.unshift(person_(n, '', false, byName[n])); });
  var idx = {};
  list.forEach(function (p) { idx[p.name] = p; });
  list.forEach(function (p) { p.family.forEach(function (f) { if (idx[f]) idx[f].seenBy.push(p.name); }); });
  return list;
}
function person_(name, belt, onList, a) {
  return {
    name: name, belt: belt, onList: onList,
    level: a ? a.level : 'Member',
    hasCode: !!(a && a.hash),
    code: a && a.hash ? a.code : '',
    made: a && a.hash ? fmtDate_(a.made) : '',
    lastSeen: a ? fmtDate_(a.last) : '',
    family: a ? a.family : [],
    seenBy: []
  };
}

/* ---------- Members ---------- */

function requestChange_(ss, s, member, kata, to, note) {
  member = str_(member); kata = str_(kata); to = str_(to); note = str_(note).slice(0, 300);
  var members = readMembers_(ss);
  if (visibleNames_(s, members).indexOf(member) === -1) throw new Error('You can only ask about your own kata.');
  var settings = getSettings_();
  if (!readKata_(ss, settings).some(function (k) { return k.name === kata; })) throw new Error('Unknown kata.');
  if (settings.statuses.indexOf(to) === -1) throw new Error('Pick Learning, Knows or Proficient.');
  var from = (readProgress_(ss)[member] || {})[kata] || '';
  if (from === to) throw new Error('It’s already ' + to + '.');
  return withLock_(function () {
    var sh = ss.getSheetByName(TAB.REQUESTS);
    var open = readRequests_(ss).filter(function (q) {
      return q.type === 'Kata' && q.state === 'Waiting' && q.member === member && q.kata === kata;
    })[0];
    if (open) {
      sh.getRange(open.row, REQ_HEAD.indexOf('To') + 1, 1, 3).setValues([[to, note, s.name]]);
      sh.getRange(open.row, REQ_HEAD.indexOf('Time') + 1).setValue(new Date());
      return { id: open.id, member: member, kata: kata, from: from, to: to, note: note, state: 'Waiting' };
    }
    var id = newId_();
    sh.appendRow([id, new Date(), 'Kata', member, kata, from, to, note, s.name, 'Waiting', '', '', '']);
    return { id: id, member: member, kata: kata, from: from, to: to, note: note, state: 'Waiting' };
  });
}

function withdrawRequest_(ss, s, id) {
  return withLock_(function () {
    var q = findRequest_(ss, id);
    var names = visibleNames_(s, readMembers_(ss));
    if (q.state !== 'Waiting') throw new Error('An instructor has already looked at it.');
    if (q.sentBy !== s.name && names.indexOf(q.member) === -1) throw new Error('You can only withdraw your own requests.');
    setReqState_(ss, q.row, 'Withdrawn', s.name, '');
    return { id: q.id, state: 'Withdrawn' };
  });
}

function requestLink_(ss, s, member) {
  member = str_(member);
  if (!s.hasRow) throw new Error('Sign in with your own access code to link family members.');
  var hit = readMembers_(ss).filter(function (m) { return m.name.toLowerCase() === member.toLowerCase(); })[0];
  if (!hit) throw new Error('No member is called “' + member + '”. Use their name exactly as the dojo has it.');
  if (hit.name === s.name || s.family.indexOf(hit.name) !== -1) throw new Error('You can already see ' + hit.name + '.');
  return withLock_(function () {
    var dup = readRequests_(ss).some(function (q) {
      return q.type === 'Family' && q.state === 'Waiting' && q.sentBy === s.name && q.member === hit.name;
    });
    if (!dup) ss.getSheetByName(TAB.REQUESTS).appendRow([newId_(), new Date(), 'Family', hit.name, '', '', '', '', s.name, 'Waiting', '', '', '']);
    return { member: hit.name, state: 'Waiting' };
  });
}

/* ---------- Moderators ---------- */

function saveStatus_(ss, s, member, kata, status) {
  return saveStatusChecked_(member, kata, status, s.name);
}

/** Instructors and admins add a member: a new row on the Members tab (Active = Yes) and on Progress. */
function addMember_(ss, s, name, belt) {
  name = str_(name).replace(/\s+/g, ' ').replace(/,/g, ' ');
  belt = str_(belt);
  if (!name || name.length > 60) throw new Error('Type their name (up to 60 letters).');
  if (!getSettings_().belts.some(function (b) { return b.name === belt; })) throw new Error('Pick their belt.');
  return withLock_(function () {
    var sh = ss.getSheetByName(TAB.MEMBERS);
    var v = sh.getDataRange().getValues(), h = v[0].map(str_), ni = h.indexOf('Name');
    var same = v.slice(1).filter(function (r) { return str_(r[ni]).toLowerCase() === name.toLowerCase(); })[0];
    if (same) {
      var ai = h.indexOf('Active');
      throw new Error(name + (ai >= 0 && str_(same[ai]).toLowerCase() === 'no'
        ? ' is already on the Members tab but set to Active = No. Change it to Yes there.'
        : ' is already a member.'));
    }
    sh.appendRow(h.map(function (k) {
      return k === 'Name' ? name : k === 'Belt' ? belt : k === 'Active' ? 'Yes' : k === 'Notes' ? 'Added in the app by ' + s.name : '';
    }));
    syncProgress_(ss, true);
    SpreadsheetApp.flush();
    return { name: name, belt: belt };
  });
}

/** The progress grid's Save: several [member, kata, status] changes under one lock. */
function saveMany_(ss, s, changes) {
  if (!Array.isArray(changes) || changes.length > 40) throw new Error('Bad request.');
  return withLock_(function () {
    changes.forEach(function (c) {
      if (!Array.isArray(c)) throw new Error('Bad request.');
      saveStatusChecked_(c[0], c[1], c[2], s.name);
    });
    return { saved: changes.length };
  });
}

function decide_(ss, s, id, verdict) {
  if (verdict !== 'Approved' && verdict !== 'Declined') throw new Error('Bad request.');
  return withLock_(function () {
  var q = findRequest_(ss, id);
  if (q.type === 'Family') need_(s, 'Admin');
  if (q.state !== 'Waiting') throw new Error('Someone has already ' + q.state.toLowerCase() + ' this.');
  var was = '';
  if (q.type === 'Kata' && verdict === 'Approved') {
    was = (readProgress_(ss)[q.member] || {})[q.kata] || '';
    saveStatusChecked_(q.member, q.kata, q.to, s.name + ' (request)');
  }
  if (q.type === 'Family' && verdict === 'Approved') setFamily_(ss, q.sentBy, q.member, true);
  setReqState_(ss, q.row, verdict, s.name, was);
  return { id: q.id, state: verdict, member: q.member, kata: q.kata, status: verdict === 'Approved' ? q.to : was };
  });
}

function undoDecision_(ss, s, id) {
  return withLock_(function () {
  var q = findRequest_(ss, id);
  if (q.type === 'Family') need_(s, 'Admin');
  if (q.state !== 'Approved' && q.state !== 'Declined') throw new Error('Nothing to undo.');
  if (q.type === 'Kata' && q.state === 'Approved') saveStatusChecked_(q.member, q.kata, q.was, s.name + ' (undo)');
  if (q.type === 'Family' && q.state === 'Approved') setFamily_(ss, q.sentBy, q.member, false);
  var sh = ss.getSheetByName(TAB.REQUESTS);
  sh.getRange(q.row, REQ_HEAD.indexOf('State') + 1, 1, 4).setValues([['Waiting', '', '', '']]);
  return { id: q.id, state: 'Waiting', member: q.member, kata: q.kata, status: q.state === 'Approved' ? q.was : null };
  });
}

/* ---------- Admins ---------- */

function setLevel_(ss, s, name, level) {
  name = str_(name);
  if (LEVELS.indexOf(level) === -1) throw new Error('Pick Member, Moderator, Instructor or Admin.');
  return withLock_(function () {
    var rows = readAccess_(ss);
    var a = rows.filter(function (x) { return x.name === name; })[0];
    if (a && a.level === 'Admin' && level !== 'Admin' &&
        rows.filter(function (x) { return x.level === 'Admin' && x.hash; }).length <= 1) {
      throw new Error('Keep at least one admin with a code. Make someone else an admin first.');
    }
    var row = a ? a.row : addAccessRow_(ss, name, readMembers_(ss));
    ss.getSheetByName(TAB.ACCESS).getRange(row, ACCESS_HEAD.indexOf('Level') + 1).setValue(level);
    return { name: name, level: level };
  });
}

/** Makes a new access code. It's returned once and only its hash is kept. */
function makeCode_(ss, s, name) {
  name = str_(name);
  return withLock_(function () {
    var rows = readAccess_(ss);
    var used = {};
    rows.forEach(function (x) { if (x.hash) used[x.hash] = true; });
    var code, hash;
    do { code = newCode_(); hash = codeHash_(code); } while (used[hash]);
    var a = rows.filter(function (x) { return x.name === name; })[0];
    var row = a ? a.row : addAccessRow_(ss, name, readMembers_(ss));
    var sh = ss.getSheetByName(TAB.ACCESS);
    var shown = code.slice(0, 3) + '-' + code.slice(3);
    sh.getRange(row, ACCESS_HEAD.indexOf('Code hash') + 1, 1, 2).setValues([[hash, new Date()]]);
    sh.getRange(row, ACCESS_HEAD.indexOf('Code') + 1).setValue(shown);
    return { name: name, code: shown };
  });
}

function removeCode_(ss, s, name) {
  name = str_(name);
  return withLock_(function () {
    var rows = readAccess_(ss);
    var a = rows.filter(function (x) { return x.name === name; })[0];
    if (!a || !a.hash) return { name: name };
    if (a.level === 'Admin' && rows.filter(function (x) { return x.level === 'Admin' && x.hash; }).length <= 1) {
      throw new Error('This is the only admin code. Make someone else an admin first.');
    }
    var sh = ss.getSheetByName(TAB.ACCESS);
    sh.getRange(a.row, ACCESS_HEAD.indexOf('Code hash') + 1, 1, 2).setValues([['', '']]);
    sh.getRange(a.row, ACCESS_HEAD.indexOf('Code') + 1).setValue('');
    return { name: name };
  });
}

/** Someone who isn't on the member list, e.g. an instructor or a parent. */
function addPerson_(ss, s, name, level) {
  name = str_(name).replace(/,/g, ' ').slice(0, 60);
  if (!name) throw new Error('Type their name.');
  if (LEVELS.indexOf(level) === -1) level = 'Member';
  return withLock_(function () {
    if (readAccess_(ss).some(function (x) { return x.name.toLowerCase() === name.toLowerCase(); }) ||
        readMembers_(ss).some(function (m) { return m.name.toLowerCase() === name.toLowerCase(); })) {
      throw new Error(name + ' is already on the list.');
    }
    var sh = ss.getSheetByName(TAB.ACCESS);
    sh.appendRow([name, level, '', '', '', '', 'Not on the member list']);
    return { name: name, level: level };
  });
}

function removeFamily_(ss, s, account, member) {
  return withLock_(function () { setFamily_(ss, str_(account), str_(member), false); return { ok: true }; });
}

/* ---------- Writes ---------- */

/** The progress write itself, once access has been checked. status '' clears it. */
function saveStatusChecked_(memberName, kataName, status, who) {
  var settings = getSettings_();
  memberName = str_(memberName);
  kataName = str_(kataName);
  status = str_(status);
  if (status && settings.statuses.indexOf(status) === -1) throw new Error('Unknown status: ' + status);
  return withLock_(function () {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(TAB.PROGRESS);
    var pos = findCell_(sheet, memberName, kataName);
    if (!pos) { syncProgress_(ss, true); pos = findCell_(sheet, memberName, kataName); }
    if (!pos) throw new Error('Could not find ' + memberName + ' / ' + kataName + ' on the Progress tab.');
    sheet.getRange(pos.row, pos.col).setValue(status);
    ss.getSheetByName(TAB.LOG).appendRow([new Date(), memberName, kataName, status || '(cleared)', str_(who) || 'Instructor']);
    SpreadsheetApp.flush();
    return { ok: true, member: memberName, kata: kataName, status: status };
  });
}

var lockHeld_ = false;
function withLock_(fn) {
  if (lockHeld_) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  lockHeld_ = true;
  try { return fn(); }
  finally { lockHeld_ = false; lock.releaseLock(); }
}

function addAccessRow_(ss, name, members) {
  var m = members.filter(function (x) { return x.name === name; })[0];
  if (!m) throw new Error('No one called ' + name + ' on the member list.');
  var sh = ss.getSheetByName(TAB.ACCESS);
  sh.appendRow([name, 'Member', '', '', '', '', '']);
  return sh.getLastRow();
}

function setFamily_(ss, account, member, add) {
  var a = readAccess_(ss).filter(function (x) { return x.name === account; })[0];
  if (!a) throw new Error(account + ' isn’t on the Access tab.');
  var fam = a.family.filter(function (n) { return n !== member; });
  if (add) fam.push(member);
  ss.getSheetByName(TAB.ACCESS).getRange(a.row, ACCESS_HEAD.indexOf('Family') + 1).setValue(fam.join(', '));
}

function setReqState_(ss, row, state, who, was) {
  ss.getSheetByName(TAB.REQUESTS).getRange(row, REQ_HEAD.indexOf('State') + 1, 1, 4)
    .setValues([[state, who, new Date(), was]]);
}

function findRequest_(ss, id) {
  var q = readRequests_(ss).filter(function (x) { return x.id === str_(id); })[0];
  if (!q) throw new Error('That request is gone. Refresh and try again.');
  return q;
}

function newId_() { return 'R' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1296).toString(36).toUpperCase(); }

function newCode_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + Math.random());
  var out = '';
  for (var i = 0; out.length < 6; i++) {
    var b = bytes[i] & 255;
    if (b < 248) out += CODE_ALPHABET.charAt(b % 31);   // 248 = 8 × 31, so every letter is equally likely
  }
  return out;
}

/* ---------- Sheet menu ---------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Kata Tracker')
    .addItem('Sync progress', 'menuSync_')
    .addItem('Make an access code…', 'menuMakeCode_')
    .addItem('Sign everyone out', 'menuSignOutAll_')
    .addSeparator()
    .addItem('Show the Lesson Planner key', 'menuPlannerKey_')
    .addToUi();
}

function menuSync_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTabs_(ss);
  var added = syncProgress_(ss, true);
  ss.toast('Added ' + added.members + ' member row(s) and ' + added.kata + ' kata column(s).', 'Kata Tracker');
}

/** For setting up the first admin, or anyone, straight from the sheet. */
function menuMakeCode_() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTabs_(ss);
  var r1 = ui.prompt('Make an access code', 'Their name, exactly as on the Members tab (or an instructor’s name, e.g. Mr. Luo):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var name = str_(r1.getResponseText()).replace(/,/g, ' ');
  if (!name) return;
  var r2 = ui.prompt('Access level for ' + name, 'Member, Moderator, Instructor or Admin:', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var level = LEVELS.filter(function (l) { return l.toLowerCase() === str_(r2.getResponseText()).toLowerCase(); })[0];
  if (!level) { ui.alert('Type Member, Moderator, Instructor or Admin.'); return; }
  var onList = readMembers_(ss).some(function (m) { return m.name === name; });
  if (!onList && !readAccess_(ss).some(function (a) { return a.name === name; })) {
    ss.getSheetByName(TAB.ACCESS).appendRow([name, level, '', '', '', '', 'Not on the member list']);
  }
  var admin = { name: 'Sheet menu', level: 'Admin', family: [], hasRow: false };
  setLevel_(ss, admin, name, level);
  var res = makeCode_(ss, admin, name);
  SpreadsheetApp.flush();   // save the code before the pop-up, which can stay open for minutes
  ui.alert('Access code for ' + name,
    res.code + '\n\nLevel: ' + level + '\nGive this to them now. It’s also saved in the Code column of this Access tab, and admins can see it in the app’s Access screen. ' +
    'They sign in at ' + SITE_URL, ui.ButtonSet.OK);
}

function menuSignOutAll_() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Sign everyone out?', 'Everyone will need to enter their access code again. Codes stay the same.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperty('TOKEN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  SpreadsheetApp.getActiveSpreadsheet().toast('Everyone has been signed out.', 'Kata Tracker');
}

/* ---------- Lesson Planner link: active member names for instructors' class notes ---------- */

/**
 * The SKA Lesson Planner's own script asks for the member list here (server to server, never from a phone),
 * so instructors can tag notes with a student's name. It sends the key from Script Property PLANNER_KEY,
 * which this menu item makes and shows: Kata Tracker → Show the Lesson Planner key.
 */
function plannerMembers_(key) {
  var want = PropertiesService.getScriptProperties().getProperty('PLANNER_KEY');
  if (!want || !key || sha256Hex_(String(key)) !== sha256Hex_(want)) return { ok: false, error: 'bad_key' };
  return { ok: true, members: readMembers_(SpreadsheetApp.getActiveSpreadsheet()) };
}

function plannerKey_() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('PLANNER_KEY');
  if (!k) { k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); props.setProperty('PLANNER_KEY', k); }
  return k;
}

function menuPlannerKey_() {
  SpreadsheetApp.getUi().alert('Lesson Planner key',
    'Paste this into the SKA Lesson Planner sheet: SKA Lesson Planner menu → Connect to the Kata Tracker…\n\n' + plannerKey_() +
    '\n\nIt lets the planner read the names of active members (name and belt only). Keep it private.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/* ---------- Reading the tabs ---------- */

function ensureTabs_(ss) {
  [[TAB.ACCESS, ACCESS_HEAD], [TAB.REQUESTS, REQ_HEAD]].forEach(function (t) {
    var sh = ss.getSheetByName(t[0]);
    if (!sh) {
      sh = ss.insertSheet(t[0]);
      sh.getRange(1, 1, 1, t[1].length).setValues([t[1]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      return;
    }
    // A tab made before a column was added gets the missing header (e.g. Access → Code).
    var last = t[1].length, head = sh.getRange(1, last);
    if (!str_(head.getValue())) head.setValue(t[1][last - 1]).setFontWeight('bold');
  });
}

function readAccess_(ss) {
  var sh = ss.getSheetByName(TAB.ACCESS);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var h = v[0].map(str_);
  var col = function (name) { return h.indexOf(name); };
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var name = str_(v[r][col('Name')]);
    if (!name) continue;
    var level = str_(v[r][col('Level')]);
    level = LEVELS.filter(function (l) { return l.toLowerCase() === level.toLowerCase(); })[0] || 'Member';
    out.push({
      row: r + 1, name: name, level: level,
      hash: str_(v[r][col('Code hash')]).toLowerCase(),
      made: v[r][col('Code made')],
      family: str_(v[r][col('Family')]).split(',').map(str_).filter(String),
      last: v[r][col('Last signed in')],
      code: col('Code') >= 0 ? str_(v[r][col('Code')]) : ''
    });
  }
  return out;
}

function readRequests_(ss) {
  var sh = ss.getSheetByName(TAB.REQUESTS);
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var h = v[0].map(str_);
  var g = function (row, name) { return row[h.indexOf(name)]; };
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var id = str_(g(v[r], 'ID'));
    if (!id) continue;
    var dec = g(v[r], 'Decided at');
    var time = g(v[r], 'Time');
    out.push({
      row: r + 1, id: id, type: str_(g(v[r], 'Type')) || 'Kata',
      time: fmtDate_(time), timeMs: time instanceof Date ? time.getTime() : 0,
      member: str_(g(v[r], 'Member')), kata: str_(g(v[r], 'Kata')),
      from: str_(g(v[r], 'From')), to: str_(g(v[r], 'To')), note: str_(g(v[r], 'Note')),
      sentBy: str_(g(v[r], 'Sent by')), state: str_(g(v[r], 'State')) || 'Waiting',
      decidedBy: str_(g(v[r], 'Decided by')), decided: fmtDate_(dec),
      decidedMs: dec instanceof Date ? dec.getTime() : 0, was: str_(g(v[r], 'Was'))
    });
  }
  return out;
}

function fmtDate_(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return str_(d);
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function readKata_(ss, settings) {
  return readTable_(ss.getSheetByName(TAB.KATA))
    .filter(function (r) { return str_(r['Kata']); })
    .map(function (r) {
      return {
        order: Number(r['Order']) || 9999,
        name: str_(r['Kata']),
        meaning: str_(r['Meaning']) || str_(r['English Translation']),
        category: str_(r['Category']) || 'Solo',
        belt: str_(r['Belt']) || (settings.belts[0] ? settings.belts[0].name : ''),
        learnedAt: str_(r['Learned at']),
        notes: str_(r['Notes'])
      };
    })
    .sort(function (a, b) { return a.order - b.order; });
}

/** The newest Log rows (time, member, kata, status, who) for the given members, newest first. */
function readLog_(ss, names, max) {
  var sheet = ss.getSheetByName(TAB.LOG);
  var last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return [];
  var start = Math.max(2, last - max + 1);
  var rows = sheet.getRange(start, 1, last - start + 1, 5).getValues();
  var out = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i], who = str_(r[1]);
    if (!who || names.indexOf(who) === -1) continue;
    var st = str_(r[3]);
    out.push({ time: fmtDate_(r[0]), member: who, kata: str_(r[2]), status: st === '(cleared)' ? '' : st, by: str_(r[4]) });
  }
  return out;
}

function readMembers_(ss) {
  return readTable_(ss.getSheetByName(TAB.MEMBERS))
    .filter(function (r) { return str_(r['Name']) && str_(r['Active']).toLowerCase() !== 'no'; })
    .map(function (r) { return { name: str_(r['Name']), belt: str_(r['Belt']) }; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

/** Progress matrix -> { memberName: { kataName: status } } */
function readProgress_(ss) {
  var progress = {};
  var values = ss.getSheetByName(TAB.PROGRESS).getDataRange().getDisplayValues();
  var header = values[0] || [];
  for (var r = 1; r < values.length; r++) {
    var who = str_(values[r][0]);
    if (!who) continue;
    var row = {};
    for (var c = FIRST_KATA_COL - 1; c < header.length; c++) {
      var k = str_(header[c]);
      var s = str_(values[r][c]);
      if (k && s) row[k] = s;
    }
    progress[who] = row;
  }
  return progress;
}

/**
 * Each kata with how many active members still need it: members at or above the belt
 * it's learned at (or its rank, when Learned at is blank) who don't Know it yet.
 */
function kataSummary_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var settings = getSettings_();
  var beltNames = settings.belts.map(function (b) { return b.name.toLowerCase(); });
  var idx = function (text) {
    // "Blue/Purple" counts as the lowest belt it names.
    var parts = str_(text).toLowerCase().split(/[\/,&]| or | and /);
    var best = -1;
    parts.forEach(function (p) {
      var i = beltNames.indexOf(str_(p));
      if (i >= 0 && (best === -1 || i < best)) best = i;
    });
    return best;
  };
  var statuses = settings.statuses;
  var known = function (s) {
    var i = s ? statuses.indexOf(s) : -1;
    return statuses.length > 1 ? i >= 1 : i >= 0;
  };
  var kata = readKata_(ss, settings);
  var members = readMembers_(ss);
  var progress = readProgress_(ss);
  return kata.map(function (k) {
    var from = k.learnedAt ? idx(k.learnedAt) : idx(k.belt);
    var need = 0, learning = 0;
    members.forEach(function (m) {
      var mi = idx(m.belt);
      if (from < 0 || mi < from) return;
      var s = (progress[m.name] || {})[k.name] || '';
      if (known(s)) return;
      need++;
      if (s) learning++;
    });
    return {
      name: k.name, meaning: k.meaning, category: k.category,
      belt: k.belt, learnedAt: k.learnedAt, need: need, learning: learning
    };
  });
}

/* ---------- Helpers ---------- */

/** Makes sure every active member has a Progress row and every kata a Progress column. */
function syncProgress_(ss, alreadyLockedOrForce) {
  var sheet = ss.getSheetByName(TAB.PROGRESS);
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var existingKata = {};
  header.slice(FIRST_KATA_COL - 1).forEach(function (h) { if (str_(h)) existingKata[str_(h)] = true; });

  var lastRow = sheet.getLastRow();
  var existingMembers = {};
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().forEach(function (r) {
      if (str_(r[0])) existingMembers[str_(r[0])] = true;
    });
  }

  var kataNames = readTable_(ss.getSheetByName(TAB.KATA))
    .sort(function (a, b) { return (Number(a['Order']) || 9999) - (Number(b['Order']) || 9999); })
    .map(function (r) { return str_(r['Kata']); })
    .filter(function (n) { return n && !existingKata[n]; });

  var memberNames = readTable_(ss.getSheetByName(TAB.MEMBERS))
    .map(function (r) { return str_(r['Name']); })
    .filter(function (n) { return n && !existingMembers[n]; });

  if (!kataNames.length && !memberNames.length) return { kata: 0, members: 0 };

  var lock = null;
  if (!alreadyLockedOrForce && !lockHeld_) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return { kata: 0, members: 0 };
  }
  try {
    if (kataNames.length) {
      var lastHeaderCol = Math.max(lastNonEmptyIndex_(header) + 1, FIRST_KATA_COL - 1);
      var needed = lastHeaderCol + kataNames.length;
      if (needed > sheet.getMaxColumns()) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns() + 10);
      }
      sheet.getRange(1, lastHeaderCol + 1, 1, kataNames.length).setValues([kataNames]);
    }
    if (memberNames.length) {
      var start = Math.max(sheet.getLastRow(), 1) + 1;
      if (start + memberNames.length > sheet.getMaxRows()) {
        sheet.insertRowsAfter(sheet.getMaxRows(), memberNames.length + 50);
      }
      // Column A only: column B is an ARRAYFORMULA that fills in each member's belt.
      sheet.getRange(start, 1, memberNames.length, 1)
        .setValues(memberNames.map(function (n) { return [n]; }));
    }
    applyStatusDropdowns_(ss, sheet);
  } finally {
    if (lock) lock.releaseLock();
  }
  return { kata: kataNames.length, members: memberNames.length };
}

function applyStatusDropdowns_(ss, sheet) {
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var cols = Math.max(sheet.getMaxColumns() - FIRST_KATA_COL + 1, 1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(TAB.SETTINGS).getRange('D2:D10'), true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, FIRST_KATA_COL, rows, cols).setDataValidation(rule);
}

function findCell_(sheet, memberName, kataName) {
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var col = -1;
  for (var c = FIRST_KATA_COL - 1; c < header.length; c++) {
    if (str_(header[c]) === kataName) { col = c + 1; break; }
  }
  if (col === -1) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var names = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (var r = 0; r < names.length; r++) {
    if (str_(names[r][0]) === memberName) return { row: r + 2, col: col };
  }
  return null;
}

function getSettings_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB.SETTINGS);
  var v = sheet.getRange('A1:D30').getDisplayValues();
  var out = { dojoName: '', pin: '', belts: [], statuses: [] };
  for (var i = 0; i < v.length; i++) {
    var label = str_(v[i][0]).toLowerCase();
    if (label === 'dojo name') out.dojoName = str_(v[i][1]);
    if (label === 'instructor pin' || label === 'instructor password') out.pin = str_(v[i][1]);
    if (i >= 6 && str_(v[i][0])) out.belts.push({ name: str_(v[i][0]), color: str_(v[i][1]) || '#999999' });
    if (i >= 1 && i <= 9 && str_(v[i][3])) out.statuses.push(str_(v[i][3]));
  }
  return out;
}

/** Reads a tab with a header row into an array of objects keyed by header. */
function readTable_(sheet) {
  var v = sheet.getDataRange().getDisplayValues();
  if (v.length < 2) return [];
  var h = v[0].map(str_);
  return v.slice(1).map(function (row) {
    var o = {};
    h.forEach(function (key, i) { if (key) o[key] = row[i]; });
    return o;
  });
}

function lastNonEmptyIndex_(arr) {
  for (var i = arr.length - 1; i >= 0; i--) if (str_(arr[i])) return i;
  return -1;
}

function str_(x) {
  return x === null || x === undefined ? '' : String(x).trim();
}
