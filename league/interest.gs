// ============================================================
//  Delhi Padel League — interest forms → Google Sheet
//
//  Bound to the "DPL Interest" sheet. Two tabs, created with their headers
//  the first time (or run setupTabs() once from the editor to create them now):
//    Players  ← "Register interest"
//    Partners ← "Partner with DPL"
//
//  The League page POSTs JSON: { form: "player" | "sponsor", ...fields }.
//  Replies { ok: true } once the row is saved, or { ok: false, error }.
//
//  SETUP: paste this, Save, run setupTabs() once (approve access), then
//  Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
// ============================================================

const TABS = {
  player: {
    name: 'Players',
    headers: ['Timestamp', 'Name', 'Phone', 'Email', 'City / area', 'Padel level', 'Instagram', 'Status', 'Notes'],
    fields: ['name', 'phone', 'email', 'area', 'level', 'instagram'],
    required: ['name', 'phone', 'email'],
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
    const t = TABS[data.form];
    if (!t) return reply({ ok: false, error: 'Unknown form' });
    const missing = t.required.filter(k => !clean(data[k]));
    if (missing.length) return reply({ ok: false, error: 'Missing: ' + missing.join(', ') });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sh = tab(t);
      const row = [new Date()].concat(t.fields.map(k => k === 'phone' ? phone(data.phone) : clean(data[k], k === 'message' ? 2000 : 200)), ['New', '']);
      const r = sh.getLastRow() + 1;
      // Phone column as text first, so Sheets keeps the +91 and leading zeros.
      sh.getRange(r, t.headers.indexOf('Phone') + 1).setNumberFormat('@');
      sh.getRange(r, 1, 1, row.length).setValues([row]);
    } finally {
      lock.releaseLock();
    }
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
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
