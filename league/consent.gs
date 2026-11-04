// ============================================================
//  DPL — Player consent form → its own Google Sheet
//
//  The page league/consent/ POSTs each answer here: { name, phone, team, … } → { ok: true }.
//
//  SETUP: make a new Google Sheet, Extensions → Apps Script, paste this, Save.
//  Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone) → copy the
//  /exec URL into CONSENT_API in league/consent/index.html.
// ============================================================

const HEADERS = ['Timestamp', 'Name', 'Phone', 'Team', 'Fantasy money', 'Deals are private', 'League fee',
                 'Commitment', 'Signature'];
const FIELDS = ['name', 'phone', 'team', 'fantasy', 'private', 'fee', 'commit', 'signature'];

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const missing = FIELDS.filter(k => !clean(data[k]));
    if (missing.length) return reply({ ok: false, error: 'Missing: ' + missing.join(', ') });
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      if (sh.getLastRow() === 0) {
        sh.appendRow(HEADERS);
        sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
        sh.setFrozenRows(1);
      }
      sh.appendRow([new Date()].concat(FIELDS.map(k => clean(data[k]))));
    } finally { lock.releaseLock(); }
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

// Trimmed, length-capped text; a leading = + - @ is escaped so it can't run as a formula.
function clean(v) {
  let s = String(v == null ? '' : v).trim().slice(0, 500);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
