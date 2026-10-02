// ============================================================
//  Delhi//PadelCollective — Ratings API (Rating&Ranking sheet)
//
//  Bound to the "Rating&Ranking" spreadsheet. Replaces, in one script:
//    - the Break Point and First Serve leaderboard endpoints
//    - Master's getPlayer / getPlayerMatches / getAllMatches
//    - the Dashboard → Supabase sync (and Break Point / First Serve in the
//      leaderboard sync)
//
//  GET ?action=
//    breakPoint | firstServe          → same JSON the old leaderboard endpoints sent
//    getPlayer&phone=…                → { success, player }
//    getPlayerMatches&phone=…         → { success, phone, total, matches }
//    getAllMatches                    → { success, total, matches } (no phones)
//    sync                             → rebuild leaderboard_cache + dashboard_cache now
//
//  Reads only the tabs the sheet calculates (BP_/FS_final, _Americano,
//  _tournament, FS_personal), the match tabs and Player_ID — by header name,
//  so moving columns doesn't break it.
//
//  Ranking: only players with MIN_MATCHES+ matches are ranked (by rating),
//  everyone else gets a blank Ranking — the sheet's own Ranking column is ignored.
//
//  Beat-the-field bonus: every sync rewrites the Competitive_bonus tab (BP/FS bonus
//  per player) from the Americano match tabs. Not added to Rating yet.
//
//  SETUP: Extensions → Apps Script in the Rating&Ranking sheet, paste this,
//  put the service_role key on SB_SERVICE_KEY, Deploy → New deployment → Web app
//  (Execute as: Me, Who has access: Anyone). Then run installTriggers() once.
// ============================================================

const SS = SpreadsheetApp.getActiveSpreadsheet();
const SB_URL         = 'https://zruqzybdpniofxbcwuat.supabase.co';
const SB_SERVICE_KEY = 'YOUR_LEGACY_SERVICE_ROLE_KEY_STARTS_WITH_eyJ'; // service_role — never commit the real one
const MIN_MATCHES = 2;
const VENUE = { BP: 'Breakpoint', FS: 'First Serve' };
// Beat-the-field bonus (Americano only): +BONUS_PER_PLACE for every place a player
// finishes above their seed (their rating's rank in that match), capped at BONUS_CAP.
const BONUS_PER_PLACE = 0.01, BONUS_CAP = 0.3, BONUS_MIN_FIELD = 4;


// ============================================================
//  HTTP
// ============================================================
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'breakPoint': return json_(build_().bp);
      case 'firstServe': return json_(build_().fs);
      case 'getPlayer': {
        const pl = build_().players.get(d10_(p.phone));
        return json_(pl ? { success: true, player: pl } : { success: false, message: 'Player not found' });
      }
      case 'getPlayerMatches': {
        const ph = d10_(p.phone), m = build_().matches.get(ph) || [];
        return json_({ success: true, phone: ph, total: m.length, matches: m });
      }
      case 'getAllMatches': {
        const all = build_().allMatches;
        return json_({ success: true, ok: true, total: all.length, matches: all });
      }
      case 'sync':
      case 'syncDashboard': return json_(syncNow_());
      default: return json_({ success: false, message: 'Unknown action' });
    }
  } catch (err) {
    return json_({ success: false, message: String(err && err.message || err) });
  }
}
function doPost(e) { return doGet(e); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }


// ============================================================
//  READING THE SHEET
// ============================================================
// Last 10 digits: strips +91, spaces and dashes so every number compares the same.
function d10_(v) { const d = String(v == null ? '' : v).replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; }
function str_(v) { return String(v == null ? '' : v).trim(); }
function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function round2_(v) { return Math.round(num_(v) * 100) / 100; }
function rank_(v) { const s = str_(v); return s === '' ? '' : (isNaN(Number(s)) ? s : Number(s)); }   // "NS" stays "NS"
function date_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SS.getSpreadsheetTimeZone(), 'd MMM yyyy');
  return str_(v);
}
function venue_(v) {
  const k = str_(v).toLowerCase().replace(/\s+/g, '');
  return k === 'breakpoint' ? VENUE.BP : k === 'firstserve' ? VENUE.FS : '';
}

// { head, rows, col(label) } — col() finds the first header that starts with label.
function tab_(name) {
  const sh = SS.getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" not found');
  const v = sh.getDataRange().getValues();
  const head = v[0].map(str_);
  return {
    head: head,
    rows: v.slice(1),
    col: function (label) { const l = label.toLowerCase(); return head.findIndex(function (h) { return h.toLowerCase().indexOf(l) === 0; }); }
  };
}

// Overall board (BP_final / FS_final): every column as-is, plus ID (phone),
// Girls, a 2-decimal Rating and our Ranking.
function finalRows_(ev, girls) {
  const t = tab_(ev + '_final');
  const iName = t.col('Name'), iPhone = t.col('Contact Number'), iMP = t.col('Matches played');
  const rows = t.rows.filter(function (r) { return str_(r[iName]); }).map(function (r) {
    const o = {};
    t.head.forEach(function (h, i) { if (h) o[h] = r[i]; });
    o.ID = d10_(r[iPhone]);
    o.Name = str_(r[iName]);
    o.Rating = round2_(o.Rating);
    o['Matches played'] = num_(r[iMP]);
    o.Girls = girls(o.ID, o.Name);
    o.Ranking = '';
    return o;
  });
  const ranked = rows.filter(function (o) { return o['Matches played'] >= MIN_MATCHES; })
    .sort(function (a, b) { return (b.Rating - a.Rating) || (num_(b.Score) - num_(a.Score)) || a.Name.localeCompare(b.Name); });
  ranked.forEach(function (o, i) {
    const prev = ranked[i - 1];
    o.Ranking = (prev && prev.Rating === o.Rating && num_(prev.Score) === num_(o.Score)) ? prev.Ranking : i + 1;
  });
  return rows;
}

// Americano / tournament / personal boards in the old endpoints' shape.
// Players who haven't played that format are left out, as before.
function subRows_(name) {
  const t = tab_(name);
  const iN = t.col('Name'), iP = t.col('Contact Number'), iMP = t.col('MP'), iS = t.col('Score'),
        iW = t.col('Won'), iL = t.col('Loss'), iF = t.col('F Pts'), iA = t.col('A Pts');
  return t.rows.filter(function (r) { return str_(r[iN]) && num_(r[iMP]) > 0; }).map(function (r) {
    const o = { MP: num_(r[iMP]), Score: num_(r[iS]), 'Player ID': d10_(r[iP]), 'Player Name': str_(r[iN]) };
    if (iW >= 0) { o.won = num_(r[iW]); o.Loss = num_(r[iL]); o['F Pts'] = num_(r[iF]); o['A pts'] = num_(r[iA]); }
    return o;
  });
}

// Everything the endpoints and the syncs need, from one read of the sheet.
function build_() {
  // Player_ID first: it holds the Girls column (optional) the boards need.
  const pid = tab_('Player_ID');
  const P = { phone: pid.col('Contact Number'), name: pid.col('Name'), venue: pid.col('Venue'), self: pid.col('Self Rating'),
              rkH: pid.col('Ranking History'), rtH: pid.col('Rating History'), girl: pid.col('Girls') };
  const girlPhones = {}, girlNames = {};
  if (P.girl >= 0) pid.rows.forEach(function (r) {
    if (!/^(true|yes|y|1)$/i.test(str_(r[P.girl]))) return;
    if (d10_(r[P.phone])) girlPhones[d10_(r[P.phone])] = true;
    girlNames[str_(r[P.name]).toLowerCase()] = true;
  });
  const girls = function (phone, name) { return !!(phone && girlPhones[phone]) || !!girlNames[String(name).toLowerCase()]; };

  const boards = { BP: finalRows_('BP', girls), FS: finalRows_('FS', girls) };
  const onBoard = { BP: {}, FS: {} };
  ['BP', 'FS'].forEach(function (k) { boards[k].forEach(function (o) { if (o.ID) onBoard[k][o.ID] = o; }); });

  const bp = {
    breakPointOverall:    boards.BP,
    breakPointAmericano:  subRows_('BP_Americano'),
    breakPointTournament: subRows_('BP_tournament'),
  };
  const fs = {
    rankings:         boards.FS,
    firstServe:       subRows_('FS_Americano'),
    pmMatchScores:    subRows_('FS_personal'),
    tournamentScores: subRows_('FS_tournament'),
  };

  // Matches, in the shape Master's getPlayerMatches sent.
  const matches = new Map(), allMatches = [], played = { BP: {}, FS: {} }, bonus = { BP: {}, FS: {} };
  ['BP', 'FS'].forEach(function (k) {
    const t = tab_(k + '_match');
    const I = { id: t.col('Match ID'), date: t.col('Date'), type: t.col('Type'), name: t.col('Player Name'), phone: t.col('Contact Number'),
                partner: t.col('Partner'), o1: t.col('Opp 1'), o2: t.col('Opp 2'), scores: t.col('Scores'),
                pf: t.col('Points For'), pa: t.col('Points Against'), rank: t.col('Rank'), result: t.col('Result') };
    const rows = t.rows.filter(function (r) { return str_(r[I.id]) && str_(r[I.name]); });
    const byEvent = {};
    rows.forEach(function (r) { const id = str_(r[I.id]); (byEvent[id] = byEvent[id] || []).push(r); });

    // ponytail: seeds use today's board rating, not the rating on match day — use Rating History if that matters.
    Object.keys(byEvent).forEach(function (id) {
      const ev = byEvent[id];
      if (!/americano/i.test(str_(ev[0][I.type]))) return;
      const got = fieldBonus_(ev.map(function (r) {
        const ph = d10_(r[I.phone]), b = onBoard[k][ph];
        return { phone: ph, rating: b ? b.Rating : null, rank: rank_(r[I.rank]) };
      }));
      Object.keys(got).forEach(function (ph) { bonus[k][ph] = Math.min(BONUS_CAP, round2_((bonus[k][ph] || 0) + got[ph])); });
    });

    rows.forEach(function (r) {
      const id = str_(r[I.id]), type = str_(r[I.type]), ph = d10_(r[I.phone]), date = date_(r[I.date]);
      allMatches.push({ matchId: id, date: date, name: str_(r[I.name]), venue: VENUE[k], type: type });
      if (!ph) return;
      played[k][ph] = (played[k][ph] || 0) + 1;
      const m = { matchId: id, matchType: type, venue: VENUE[k], date: date, playerName: str_(r[I.name]), phone: Number(ph) };
      if (/americano/i.test(type)) {
        m.rank = rank_(r[I.rank]);
        m.total = num_(r[I.pf]);
        m.roundScores = str_(r[I.scores]);
        m.opponents = byEvent[id].filter(function (o) { return o !== r; }).map(function (o) {
          const oph = d10_(o[I.phone]), b = onBoard[k][oph];
          return { playerName: str_(o[I.name]), phone: oph ? Number(oph) : '', rank: rank_(o[I.rank]),
                   total: num_(o[I.pf]), rating: b ? b.Rating : '', roundScores: str_(o[I.scores]) };
        });
      } else {
        m.partner = str_(r[I.partner]); m.opp1 = str_(r[I.o1]); m.opp2 = str_(r[I.o2]);
        m.score = num_(r[I.pf]) + '-' + num_(r[I.pa]);
        m.result = str_(r[I.result]);
      }
      if (!matches.has(ph)) matches.set(ph, []);
      matches.get(ph).push(m);
    });
  });

  // Players, in the shape Master's getPlayer sent. Venue: Player_ID's, else
  // the event they've played most at. Rating/ranking come from that board.
  const players = new Map();
  pid.rows.forEach(function (r) {
    const ph = d10_(r[P.phone]), name = str_(r[P.name]);
    if (!ph || !name || players.has(ph)) return;
    const nBP = played.BP[ph] || 0, nFS = played.FS[ph] || 0;
    const venue = venue_(r[P.venue]) || (nBP || nFS ? (nBP >= nFS ? VENUE.BP : VENUE.FS) : '');
    const b = venue === VENUE.BP ? onBoard.BP[ph] : venue === VENUE.FS ? onBoard.FS[ph] : null;
    const self = str_(r[P.self]) === '' ? null : num_(r[P.self]);
    players.set(ph, {
      name: name, phone: ph, venue: venue,
      rating: b ? b.Rating : self,
      ranking: b && b.Ranking !== '' ? b.Ranking : null,
      selfRating: self,
      ratingHistory: P.rtH >= 0 ? str_(r[P.rtH]) : '',
      rankingHistory: P.rkH >= 0 ? str_(r[P.rkH]) : '',
    });
  });

  return { bp: bp, fs: fs, players: players, matches: matches, allMatches: allMatches, bonus: bonus };
}

// One Americano: [{ phone, rating, rank }] → { phone: bonus }. Only rated players
// with a numeric finish count; seed and finish are both ranked within that group.
function fieldBonus_(field) {
  const f = field.filter(function (p) { return p.phone && p.rating != null && p.rating !== '' && typeof p.rank === 'number'; });
  const out = {};
  if (f.length < BONUS_MIN_FIELD) return out;
  f.forEach(function (p) {
    const seed = 1 + f.filter(function (o) { return o.rating > p.rating; }).length;
    const finish = 1 + f.filter(function (o) { return o.rank < p.rank; }).length;
    if (seed > finish) out[p.phone] = BONUS_PER_PLACE * (seed - finish);
  });
  return out;
}

// Competitive_bonus tab: one row per Player_ID player, for the Rating formula to look up.
function writeBonusTab_(d) {
  const sh = SS.getSheetByName('Competitive_bonus') || SS.insertSheet('Competitive_bonus');
  const rows = [['Name', 'Contact Number', 'BP Bonus', 'FS Bonus']];
  d.players.forEach(function (p, ph) { rows.push([p.name, Number(ph), d.bonus.BP[ph] || 0, d.bonus.FS[ph] || 0]); });
  sh.clearContents();
  sh.getRange(1, 1, rows.length, 4).setValues(rows);
}


// ============================================================
//  SUPABASE SYNC — leaderboard_cache (breakPoint, firstServe) + dashboard_cache
// ============================================================
function sb_(method, path, payload) {
  const opts = {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, Prefer: 'resolution=merge-duplicates,return=minimal' },
  };
  if (payload) opts.payload = JSON.stringify(payload);
  const res = UrlFetchApp.fetch(SB_URL + '/rest/v1/' + path, opts);
  if (res.getResponseCode() >= 300) throw new Error(method + ' ' + path.split('?')[0] + ' failed: HTTP ' + res.getResponseCode() + ' — ' + res.getContentText());
}

function syncAll() {
  const d = build_(), now = new Date().toISOString();
  writeBonusTab_(d);
  sb_('post', 'leaderboard_cache', [
    { source: 'breakPoint', payload: d.bp, updated_at: now },
    { source: 'firstServe', payload: d.fs, updated_at: now },
  ]);
  const rows = [];
  d.players.forEach(function (p, ph) { rows.push({ phone: ph, player: p, matches: d.matches.get(ph) || [], updated_at: now }); });
  if (rows.length < 50) throw new Error('Only ' + rows.length + ' players in Player_ID — not syncing, so the dashboards are not wiped');
  sb_('post', 'dashboard_cache', rows);
  sb_('delete', 'dashboard_cache?updated_at=lt.' + encodeURIComponent(now));   // players no longer in Player_ID
  Logger.log('Synced ' + rows.length + ' players and both boards.');
}

// Locked + debounced: overlapping pings can't stack; a burst collapses into one sync.
function syncNow_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: true, skipped: 'a sync is already running' };
  try {
    const props = PropertiesService.getScriptProperties();
    if (Date.now() - Number(props.getProperty('lastSyncAt') || 0) < 15000) return { ok: true, skipped: 'synced <15s ago' };
    syncAll();
    props.setProperty('lastSyncAt', String(Date.now()));
    return { ok: true, synced: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}


// ============================================================
//  TRIGGERS — run installTriggers() once from the editor
// ============================================================
// An edit fires onChange many times; (re)schedule one sync a minute out instead.
function onSheetChange() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'runSyncNow') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runSyncNow').timeBased().after(60 * 1000).create();
}
function runSyncNow() { syncNow_(); }

function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['onSheetChange', 'runSyncNow', 'syncAll'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SS).onChange().create();
  ScriptApp.newTrigger('runSyncNow').timeBased().everyHours(1).create();   // safety net
}


// ============================================================
//  HISTORY SNAPSHOT — DPC menu → Record ranking & rating snapshot
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('DPC')
    .addItem('Record ranking & rating snapshot', 'recordSnapshot')
    .addItem('Sync website now', 'syncAll')
    .addToUi();
}

// Appends "dd.mm.yyyy, value" to each ranked/rated player's history in Player_ID.
function recordSnapshot() {
  const d = build_(), sh = SS.getSheetByName('Player_ID'), t = tab_('Player_ID');
  const iPh = t.col('Contact Number'), iRk = t.col('Ranking History'), iRt = t.col('Rating History');
  const today = Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), 'dd.MM.yyyy');
  const add = function (hist, v) { return (str_(hist) ? str_(hist) + '; ' : '') + today + ', ' + v; };
  const rk = [], rt = [];
  t.rows.forEach(function (r) {
    const p = d.players.get(d10_(r[iPh])), onBoard = p && p.ranking != null;
    rk.push([onBoard ? add(r[iRk], p.ranking) : r[iRk]]);
    rt.push([onBoard ? add(r[iRt], p.rating) : r[iRt]]);
  });
  if (!t.rows.length) return;
  sh.getRange(2, iRk + 1, rk.length, 1).setValues(rk);
  sh.getRange(2, iRt + 1, rt.length, 1).setValues(rt);
  syncAll();
}
