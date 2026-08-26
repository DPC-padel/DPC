/* ============================================================
 *  Delhi//PadelCollective — Leaderboard → Supabase sync
 *
 *  Standalone Google Apps Script. It does NOT need to be bound to
 *  any sheet — it just calls your 4 existing public leaderboard
 *  endpoints and pushes their JSON into the Supabase cache table.
 *
 *  SETUP
 *   1. script.google.com → New project → paste this file.
 *   2. Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY below.
 *      (Service-role key — Supabase dashboard → Settings → API.
 *       Keep it here only; never put it in the website.)
 *   3. Run syncAll() once and authorise it.
 *   4. Run installTrigger() once to auto-sync every 5 minutes.
 *
 *  To sync instantly when you edit a sheet instead of on a timer,
 *  see the note at the bottom of this file.
 * ============================================================ */

// IMPORTANT: use the LEGACY service_role key (a JWT starting with "eyJ"),
// NOT a new "sb_secret_..." key. The new secret keys reject Apps Script
// requests as "browser" use ("Forbidden use of secret API key in browser").
// Find it under Settings → API Keys → Legacy API keys → service_role.
const SUPABASE_URL         = 'https://zruqzybdpniofxbcwuat.supabase.co';
const SUPABASE_SERVICE_KEY = 'YOUR_LEGACY_SERVICE_ROLE_KEY_STARTS_WITH_eyJ';

// The same public endpoints the website already uses.
const SOURCES = {
  firstServe: 'https://script.google.com/macros/s/AKfycbyUACkr6V5Kn4yla7Wv6vIJ6cNXoxtHR4yFYrXS66uHfhumDjgIJVzOFpuMZK3o5uGa/exec',
  breakPoint: 'https://script.google.com/macros/s/AKfycbxz0ee4RK4niCcg0lVwmktJKoCmy6lP3q9O5c6Md41m6AElQcxRN-wU810bkCbYVsk8/exec',
  matchPoint: 'https://script.google.com/macros/s/AKfycbz0EuOkKQvC7F2BAjymJQEoGF1qmglQRnP07eqMrLmECTXSZrXj-PpvDZ18cBeLrRHF6A/exec',
  noida:      'https://script.google.com/macros/s/AKfycbyum4imblCdj5mFLbr-zDFthSM8Am0f-1DrEVgdF7jioZueooMguFDgy5GX7V_3yRNH/exec'
};

/** Pull all 4 endpoints and upsert their JSON into leaderboard_cache. */
function syncAll() {
  const rows = [];
  const errors = [];

  Object.keys(SOURCES).forEach(function (source) {
    try {
      const res = UrlFetchApp.fetch(SOURCES[source], {
        muteHttpExceptions: true,
        followRedirects: true
      });
      if (res.getResponseCode() !== 200) {
        errors.push(source + ' HTTP ' + res.getResponseCode());
        return;
      }
      const payload = JSON.parse(res.getContentText());
      rows.push({ source: source, payload: payload, updated_at: new Date().toISOString() });
    } catch (e) {
      errors.push(source + ' ' + e.message);
    }
  });

  if (!rows.length) {
    throw new Error('No sources fetched. ' + errors.join('; '));
  }

  // PostgREST upsert: merge on the primary key (source).
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
  if (code >= 300) {
    throw new Error('Supabase upsert failed: HTTP ' + code + ' — ' + resp.getContentText());
  }

  Logger.log('Synced: ' + rows.map(function (r) { return r.source; }).join(', ') +
             (errors.length ? ' | skipped: ' + errors.join('; ') : ''));
}

/** Run ONCE to auto-sync every 5 minutes. */
function installTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(5).create();
  Logger.log('Trigger installed: syncAll every 5 minutes.');
}

/** Remove all triggers for this project (undo installTrigger). */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/* ------------------------------------------------------------
 *  INSTANT SYNC (optional)
 *
 *  The timer above refreshes Supabase every 5 min. If you want a
 *  score change in a sheet to reach the website within seconds,
 *  open THAT sheet's own Apps Script (Extensions → Apps Script)
 *  and add an installable onEdit/onChange trigger that calls a
 *  one-line function hitting this project's syncAll — or paste
 *  that sheet's script here and I'll wire the push in directly.
 * ------------------------------------------------------------ */
