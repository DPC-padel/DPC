/* Delhi//PadelCollective — Leaderboard → Supabase sync
   Standalone script. Needs NO Google Sheet. Calls your 4 existing
   public leaderboard endpoints and pushes their JSON to Supabase.

   Change-driven: deploy this as a Web app, and any writer (API or
   function) pings  <exec-url>?action=sync  after it writes. A 60-min
   timer is kept as a safety net. Rapid pings coalesce (min 15s apart). */

const SUPABASE_URL = 'https://zruqzybdpniofxbcwuat.supabase.co';
// Legacy service_role key (JWT, starts with eyJ). Keep your REAL key in the
// deployed script; leave this placeholder in the repo so the secret isn't committed.
const SUPABASE_SERVICE_KEY = 'YOUR_LEGACY_SERVICE_ROLE_KEY_STARTS_WITH_eyJ';

// Your existing public endpoints — leave as-is.
const SOURCES = {
  firstServe: 'https://script.google.com/macros/s/AKfycbyUACkr6V5Kn4yla7Wv6vIJ6cNXoxtHR4yFYrXS66uHfhumDjgIJVzOFpuMZK3o5uGa/exec',
  breakPoint: 'https://script.google.com/macros/s/AKfycbxz0ee4RK4niCcg0lVwmktJKoCmy6lP3q9O5c6Md41m6AElQcxRN-wU810bkCbYVsk8/exec',
  matchPoint: 'https://script.google.com/macros/s/AKfycbz0EuOkKQvC7F2BAjymJQEoGF1qmglQRnP07eqMrLmECTXSZrXj-PpvDZ18cBeLrRHF6A/exec',
  noida:      'https://script.google.com/macros/s/AKfycbyum4imblCdj5mFLbr-zDFthSM8Am0f-1DrEVgdF7jioZueooMguFDgy5GX7V_3yRNH/exec'
};

// ── Ping endpoint: any writer hits  ?action=sync  to trigger a rebuild ──
function doGet(e) {
  const a = e && e.parameter && e.parameter.action;
  if (a === 'sync') return json_(syncNow_());
  return json_({ ok: true, hint: 'add ?action=sync to trigger a rebuild' });
}
function doPost(e) { return doGet(e); }   // accept POST pings too
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Locked + debounced: overlapping pings can't stack, and a burst of writes
// collapses into one sync (skips if we synced <15s ago).
function syncNow_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: true, skipped: 'a sync is already running' };
  try {
    const props = PropertiesService.getScriptProperties();
    if (Date.now() - Number(props.getProperty('lastSyncAt') || 0) < 15000) {
      return { ok: true, skipped: 'synced <15s ago' };
    }
    syncAll();
    props.setProperty('lastSyncAt', String(Date.now()));
    return { ok: true, synced: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** Pull all 4 endpoints and upsert their JSON into leaderboard_cache. */
function syncAll() {
  const rows = [];
  const errors = [];

  Object.keys(SOURCES).forEach(function (source) {
    try {
      const res = UrlFetchApp.fetch(SOURCES[source], { muteHttpExceptions: true, followRedirects: true });
      if (res.getResponseCode() !== 200) { errors.push(source + ' HTTP ' + res.getResponseCode()); return; }
      const payload = JSON.parse(res.getContentText());
      rows.push({ source: source, payload: payload, updated_at: new Date().toISOString() });
    } catch (e) {
      errors.push(source + ' ' + e.message);
    }
  });

  if (!rows.length) throw new Error('No sources fetched. ' + errors.join('; '));

  const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/leaderboard_cache', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();
  if (code >= 300) throw new Error('Supabase upsert failed: HTTP ' + code + ' — ' + resp.getContentText());

  Logger.log('Synced: ' + rows.map(function (r) { return r.source; }).join(', ') +
             (errors.length ? ' | skipped: ' + errors.join('; ') : ''));
}

/** Run ONCE. Installs the 60-min safety-net timer (change-driven pings do the rest). */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncAll').timeBased().everyHours(1).create();
  Logger.log('Safety-net trigger installed: syncAll every 60 minutes.');
}
