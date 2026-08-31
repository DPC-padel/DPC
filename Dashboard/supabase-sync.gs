/* ============================================================
 *  Delhi//PadelCollective — Dashboard → Supabase sync
 *
 *  Standalone Google Apps Script. Builds a per-player cache:
 *    1. getAllPlayers  → the full roster (phone + base stats)
 *    2. for each player who has played, getPlayer + getPlayerMatches
 *    3. upsert one row per phone into dashboard_cache
 *    4. delete any cache row NOT in the current roster (prune orphans)
 *
 *  Runs on CHANGE, not on a timer: an onChange trigger on the Master
 *  spreadsheet schedules a single debounced sync ~1 min after the last
 *  edit, so a burst of edits collapses into one rebuild.
 *
 *  IMPORTANT: use the LEGACY service_role key (a JWT starting with
 *  "eyJ"), NOT an "sb_secret_..." key (those are rejected from
 *  Apps Script as "browser" use).
 * ============================================================ */

const SUPABASE_URL         = 'https://zruqzybdpniofxbcwuat.supabase.co';
const SUPABASE_SERVICE_KEY = 'YOUR_LEGACY_SERVICE_ROLE_KEY_STARTS_WITH_eyJ';

const MASTER_SHEET_ID = '1oOWAnf-dTq_-DX6fTS9i9Pa6yN_pl6p6IsRcrLXRckA';

const PLAYERS_API = 'https://script.google.com/macros/s/AKfycbyRmqF7c8OU7YxeSYG_EgwH4xR4ir_m6fL6M9Ds8XG7GpPZfB19op-qIDv_1YwLFkmw/exec';
const MATCHES_API = 'https://script.google.com/macros/s/AKfycbzwz3P9vVxsMxgWwQGoE9AuRToVXEAueHul_RUSNUlEMAC8Rllca3IwhlZTUPAIFVRu/exec';

/** Build the per-player cache and upsert it into dashboard_cache. */
function syncDashboard() {
  const rosterRes = UrlFetchApp.fetch(PLAYERS_API + '?action=getAllPlayers', {
    muteHttpExceptions: true, followRedirects: true
  });
  const roster = JSON.parse(rosterRes.getContentText());
  if (!roster.success || !roster.players) {
    throw new Error('getAllPlayers failed: ' + rosterRes.getContentText().slice(0, 200));
  }

  const runAt = new Date().toISOString();   // every current row is stamped with this
  const rows = [];
  roster.players.forEach(function (base) {
    const phone = String(base.phone || '').trim();
    if (!phone) return;

    let player = base;
    let matches = [];

    // The roster's matchesPlayed is unreliable (often 0), so fetch every
    // player's extended stats + matches. Players with none simply come
    // back empty and keep the base roster info.
    try {
      const pr = JSON.parse(UrlFetchApp.fetch(
        MATCHES_API + '?action=getPlayer&phone=' + encodeURIComponent(phone),
        { muteHttpExceptions: true, followRedirects: true }
      ).getContentText());
      if (pr.success && pr.player) player = Object.assign({}, base, pr.player);
    } catch (e) { /* keep base */ }

    try {
      const mr = JSON.parse(UrlFetchApp.fetch(
        MATCHES_API + '?action=getPlayerMatches&phone=' + encodeURIComponent(phone),
        { muteHttpExceptions: true, followRedirects: true }
      ).getContentText());
      if (mr.success && mr.matches) matches = mr.matches;
    } catch (e) { /* keep [] */ }

    rows.push({ phone: phone, player: player, matches: matches, updated_at: runAt });
  });

  if (!rows.length) throw new Error('No players to sync');   // guard: never prune to empty

  const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/dashboard_cache', {
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

  // Prune: delete rows not touched this run (i.e. players no longer in Master).
  const del = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/dashboard_cache?updated_at=lt.' + encodeURIComponent(runAt),
    {
      method: 'delete',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        Prefer: 'return=minimal'
      },
      muteHttpExceptions: true
    }
  );
  if (del.getResponseCode() >= 300) throw new Error('Prune failed: HTTP ' + del.getResponseCode() + ' — ' + del.getContentText());

  Logger.log('Synced ' + rows.length + ' players (pruned older rows).');
}

// ── Change-driven trigger (debounced) ───────────────────────
// onChange fires on every edit; instead of syncing inline we (re)schedule a
// single one-off run ~1 min out, so a run of edits collapses into one sync.
function onMasterChange(e) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runSyncNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runSyncNow').timeBased().after(60 * 1000).create();
}

function runSyncNow() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;   // a sync is already running
  try { syncDashboard(); } finally { lock.releaseLock(); }
}

/** Run ONCE to switch from the timer to change-driven sync. */
function installChangeTrigger() {
  // remove the old time-based trigger and any of ours, then attach onChange
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const f = t.getHandlerFunction();
    if (f === 'syncDashboard' || f === 'onMasterChange' || f === 'runSyncNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onMasterChange')
    .forSpreadsheet(SpreadsheetApp.openById(MASTER_SHEET_ID))
    .onChange()
    .create();
  Logger.log('Change-driven sync installed on the Master spreadsheet.');
}
