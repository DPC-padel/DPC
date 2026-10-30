// ============================================================
//  Delhi Padel League — interest forms → Google Sheet
//
//  Bound to the "DPL Interest" sheet. Tabs are created with their headers the
//  first time (or run setupTabs() once from the editor to create them now):
//    Player registrations ← "Register to play" (Season One registration)
//    Partners             ← "Partner with DPL"
//  (An older "Players" tab from the first interest form is left as it is.)
//
//  Fast path: the League page saves to Supabase league_inbox (~0.2s). A Supabase
//  trigger POSTs { table: "league_inbox" } here → processInbox() copies the new
//  rows into the tabs and marks them synced. A 5-minute timer runs it too, in
//  case a ping is missed (run installTrigger() once).
//  Fallback: if Supabase can't be reached, the page POSTs the entry here
//  directly: { form: "player" | "sponsor", ...fields } → { ok: true } once saved.
//
//  SETUP: paste this, put the service_role key on SB_SERVICE_KEY, Save, run
//  setupTabs() and installTrigger() once (approve access), then Deploy → Manage
//  deployments → Edit → New version (Execute as: Me, Who has access: Anyone).
// ============================================================

const SB_URL         = 'https://zruqzybdpniofxbcwuat.supabase.co';
const SB_SERVICE_KEY = 'YOUR_LEGACY_SERVICE_ROLE_KEY_STARTS_WITH_eyJ'; // service_role — never commit the real one

const TABS = {
  player: {
    name: 'Player registrations',
    headers: ['Timestamp', 'Name', 'Phone', 'Email', 'Gender', 'Date of birth', 'Instagram', 'Playing for', 'Level', 'Side',
              'Tournaments (last year)', 'Categories', 'Availability', 'T-shirt', 'Consent', 'Status', 'Notes', 'Lives in',
              'DPC rating', 'DPC ranking', 'Match history'],   // the last three are filled by updateRatings()
    after: ['area'],   // added later: after Status / Notes, so earlier rows don't shift
    fields: ['name', 'phone', 'email', 'gender', 'dob', 'instagram', 'experience', 'level', 'side',
             'tournament', 'categories', 'availability', 'tshirt', 'consent'],
    required: ['name', 'phone', 'email', 'gender', 'dob', 'experience', 'level', 'side', 'tournament', 'availability', 'tshirt', 'consent'],
  },
  sponsor: {
    name: 'Partners',
    headers: ['Timestamp', 'Name', 'Company', 'Designation', 'Email', 'Phone', 'Interested in', 'Message', 'Status', 'Notes'],
    fields: ['name', 'company', 'designation', 'email', 'phone', 'interest', 'message'],
    required: ['name', 'company', 'email', 'phone'],
  },
};

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // Supabase ping: the body isn't trusted — processInbox reads the inbox itself with the service key.
    if (data.table === 'league_inbox') return reply({ ok: true, copied: processInbox() });
    const t = TABS[data.form];
    if (!t) return reply({ ok: false, error: 'Unknown form' });
    const missing = t.required.filter(k => !clean(data[k]));
    if (missing.length) return reply({ ok: false, error: 'Missing: ' + missing.join(', ') });

    withLock(() => appendRows(t, [rowFor(t, data, new Date())]));
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

function rowFor(t, data, when) {
  return [when].concat(t.fields.map(k => k === 'phone' ? phone(data.phone) : clean(data[k], k === 'message' ? 2000 : k === 'tournament' ? 500 : 300)), ['New', ''], (t.after || []).map(k => clean(data[k])));
}

function appendRows(t, rows) {
  if (!rows.length) return;
  const sh = tab(t), r = lastRow_(sh) + 1;
  // Phone column as text first, so Sheets keeps the +91 and leading zeros.
  sh.getRange(r, t.headers.indexOf('Phone') + 1, rows.length, 1).setNumberFormat('@');
  sh.getRange(r, 1, rows.length, rows[0].length).setValues(rows);
}

// Last row with a Timestamp. Not getLastRow(): a formula column (like an ARRAYFORMULA
// "40+" column) fills every row to the bottom of the sheet, so new rows would land past the end.
function lastRow_(sh) {
  const a = sh.getRange(1, 1, sh.getMaxRows(), 1).getValues();
  let i = a.length;
  while (i > 0 && a[i - 1][0] === '') i--;
  return i;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ── Supabase inbox → tabs ──
function sb(method, path, payload) {
  const opts = { method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, Prefer: 'return=minimal' } };
  if (payload) opts.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch(SB_URL + path, opts);
  if (res.getResponseCode() >= 300) throw new Error(method + ' ' + path.split('?')[0] + ' failed: HTTP ' + res.getResponseCode() + ' — ' + res.getContentText());
  const text = res.getContentText();
  return text ? JSON.parse(text) : null;
}

// Copies every unsynced inbox row into its tab, then marks them synced. Returns how many.
function processInbox() {
  return withLock(() => {
    const rows = sb('get', '/rest/v1/league_inbox?synced=is.false&order=id&select=*');
    if (!rows.length) return 0;
    // Skip anything already in the tab (same time to the second and phone), so a run that
    // copied rows but failed to mark them synced can never copy them a second time.
    Object.keys(TABS).forEach(k => {
      const t = TABS[k], have = seen_(t);
      appendRows(t, rows.filter(x => x.form === k && !have[key_(new Date(x.created_at), x.phone)]).map(x => rowFor(t, x, new Date(x.created_at))));
    });
    SpreadsheetApp.flush();
    sb('patch', '/rest/v1/league_inbox?id=in.(' + rows.map(x => x.id).join(',') + ')', { synced: true });
    return rows.length;
  });
}

function key_(when, ph) { return Math.floor(new Date(when).getTime() / 1000) + '|' + phone(ph); }
function seen_(t) {
  const sh = tab(t), n = lastRow_(sh) - 1, out = {};
  if (n < 1) return out;
  const iP = t.headers.indexOf('Phone');
  sh.getRange(2, 1, n, t.headers.length).getValues().forEach(r => { if (r[0] instanceof Date) out[key_(r[0], r[iP])] = true; });
  return out;
}

// Run once from the editor: removes exact repeat rows (same timestamp, name and phone)
// from Player registrations and Partners, keeping the first of each.
function removeDuplicates() {
  Object.keys(TABS).forEach(k => {
    const t = TABS[k], sh = tab(t), n = lastRow_(sh) - 1;
    if (n < 1) return;
    const iN = t.headers.indexOf('Name'), iP = t.headers.indexOf('Phone'), vals = sh.getRange(2, 1, n, t.headers.length).getValues(), seen = {}, drop = [];
    vals.forEach((r, i) => { const kk = String(r[0] instanceof Date ? r[0].getTime() : r[0]) + '|' + r[iN] + '|' + phone(r[iP]); if (seen[kk]) drop.push(i + 2); else seen[kk] = true; });
    drop.reverse().forEach(row => sh.deleteRow(row));
    Logger.log(t.name + ': removed ' + drop.length + ' repeat rows');
  });
}

// Fills "DPC rating", "DPC ranking" and "Match history" for every registrant who has played with DPC,
// matched by phone against the DPC records (Supabase dashboard_cache). Players who haven't
// played with DPC are left blank, so their self-rated Level is never mistaken for a rating.
// Runs every 5 minutes; run it from the editor any time to refresh now.
function updateRatings() {
  const t = TABS.player, sh = tab(t), n = lastRow_(sh) - 1;
  if (n < 1) return 0;
  const by = {};
  // Apps Script rejects a raw ">" in a URL, so the column list is encoded.
  sb('get', '/rest/v1/dashboard_cache?select=' + encodeURIComponent('phone,rating:player->>rating,ranking:player->>ranking,matches'))
    .forEach(p => { if ((p.matches || []).length && p.rating !== null && p.rating !== '') by[String(p.phone).replace(/\D/g, '').slice(-10)] = p; });
  const iP = t.headers.indexOf('Phone'), iR = t.headers.indexOf('DPC rating');
  const out = sh.getRange(2, iP + 1, n, 1).getValues().map(([v]) => {
    const p = by[String(v).replace(/\D/g, '').slice(-10)];
    return p ? [Number(p.rating), p.ranking ? Number(p.ranking) : '', history_(p.matches)] : ['', '', ''];
  });
  sh.getRange(2, iR + 1, n, 3).setValues(out);
  sh.getRange(2, iR + 3, n, 1).setWrap(true).setVerticalAlignment('top');
  const found = out.filter(r => r[0] !== '').length;
  Logger.log('DPC ratings: ' + found + ' of ' + n + ' registrants have one');
  return found;
}

// One line per match, newest first. The level comes from the board in the match code
// (FS… First Serve, BP… Break Point); a result carried over from First Serve keeps FS.
//   DPC Sunday #6 (Inter) – Semi – 6-4 W
//   Americano #12 (Lower Inter) – #3 of 8
const LEVEL = { FS: 'Lower Inter', BP: 'Inter' };
function history_(matches) {
  const t = d => { const x = new Date(d).getTime(); return isNaN(x) ? 0 : x; };
  return matches.slice().sort((a, b) => t(b.date) - t(a.date)).map(m => {
    const id = String(m.matchId || '').toUpperCase(), no = Number(id.replace(/\D/g, '')) || '';
    const lvl = LEVEL[id.slice(0, 2)] ? ' (' + LEVEL[id.slice(0, 2)] + ')' : '';
    if (/AM/.test(id)) return 'Americano #' + no + lvl + ' – #' + (m.rank || '?') + (id.includes('(') ? '' : ' of ' + ((m.opponents || []).length + 1));
    const name = /TM/.test(id) ? 'DPC Sunday #' + no : 'Personal match';
    return name + lvl + (m.stage ? ' – ' + m.stage : '') + ' – ' + m.score + (m.result ? ' ' + m.result : '');
  }).join('\n');
}

// Every 5 min: copy anything a missed ping left in the inbox, then refresh ratings. Run installTrigger() once.
function every5Min() { processInbox(); updateRatings(); }
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'every5Min') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('every5Min').timeBased().everyMinutes(5).create();
}

// Run once from the editor to create both tabs with headers now.
function setupTabs() {
  Object.keys(TABS).forEach(k => tab(TABS[k]));
}

// The tab, created with a bold, frozen header row if it doesn't exist yet.
function tab(t) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(t.name);
  if (!sh) sh = ss.insertSheet(t.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, t.headers.length).setValues([t.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('dd mmm yyyy, hh:mm');
  } else {
    // A column added later (like "Lives in") gets its header filled in automatically.
    const row = sh.getRange(1, 1, 1, t.headers.length), have = row.getValues()[0];
    if (have.some(h => h === '')) row.setValues([t.headers.map((h, i) => have[i] === '' ? h : have[i])]).setFontWeight('bold');
  }
  return sh;
}

// Trimmed, length-capped text. A leading = + - @ is escaped so a typed
// value can never run as a spreadsheet formula.
function clean(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

// Phone: digits, + and spaces only (so it can't be a formula and needs no escaping).
function phone(v) {
  return String(v == null ? '' : v).replace(/[^\d+ ]/g, '').trim().slice(0, 20);
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
