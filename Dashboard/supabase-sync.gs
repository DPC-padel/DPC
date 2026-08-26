/* ============================================================
 *  Delhi//PadelCollective — Dashboard → Supabase sync
 *
 *  Standalone Google Apps Script. Builds a per-player cache:
 *    1. getAllPlayers  → the full roster (phone + base stats)
 *    2. for each player who has played, getPlayer + getPlayerMatches
 *    3. upsert one row per phone into dashboard_cache
 *
 *  This can live in the SAME Apps Script project as the leaderboard
 *  sync, or its own. Either way, run installTrigger() once.
 *
 *  IMPORTANT: use the LEGACY service_role key (a JWT starting with
 *  "eyJ"), NOT an "sb_secret_..." key (those are rejected from
 *  Apps Script as "browser" use).
 * ============================================================ */

const SUPABASE_URL         = 'https://zruqzybdpniofxbcwuat.supabase.co';
const SUPABASE_SERVICE_KEY = 'YOUR_LEGACY_SERVICE_ROLE_KEY_STARTS_WITH_eyJ';

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

    rows.push({ phone: phone, player: player, matches: matches, updated_at: new Date().toISOString() });
  });

  if (!rows.length) throw new Error('No players to sync');

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

  Logger.log('Synced ' + rows.length + ' players.');
}

/** Run ONCE to auto-sync every 10 minutes. */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncDashboard') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncDashboard').timeBased().everyMinutes(10).create();
  Logger.log('Trigger installed: syncDashboard every 10 minutes.');
}
