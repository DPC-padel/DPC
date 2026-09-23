// ============================================================
//  Delhi//PadelCollective — Apps Script v7 (Supabase inbox + games cache)
//
//  Events tab Row 1 (13 columns):
//  A: ID | B: Title | C: Date | D: StartTime | E: EndTime
//  F: Location | G: Game | H: Level | I: TotalSlots | J: Cost | K: CreatedAt
//  L: Link1 (single payment link) | M: Link2 (partner payment link)
//
//  RSVPs tab Row 1 (7 columns):
//  A: EventID | B: EventName | C: Name | D: Phone | E: Status | F: Timestamp | G: Paid
//
//  Registrations: the website saves to Supabase rsvp_inbox (fast). A Supabase
//  webhook POSTs here → processInbox() copies new rows into RSVPs and marks them
//  synced. The 5-min timer runs processInbox() too, in case a webhook is missed.
//  Sheet edits: an onChange trigger pushes both tabs to games_cache, so anything
//  you change in the Sheet shows on the site within seconds.
//
//  REDEPLOY: Save → Deploy → Manage Deployments → Edit → New Version → Deploy
//  After pasting v7 once: run installGamesTrigger() from the editor.
// ============================================================

const SS           = SpreadsheetApp.getActiveSpreadsheet();
const EVENTS_SHEET = "Events";
const RSVPS_SHEET  = "RSVPs";

// ── Supabase ──
const SB_URL         = 'https://zruqzybdpniofxbcwuat.supabase.co';
const SB_SERVICE_KEY = 'YOUR_LEGACY_SERVICE_ROLE_KEY_STARTS_WITH_eyJ'; // service_role — never commit the real one

function makeResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) throw new Error(`Sheet tab "${name}" not found. Check your tab names.`);
  return sheet;
}

function toDateStr(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(val);
}

function toTimeStr(val) {
  if (!val && val !== 0) return "";
  if (typeof val === "number") {
    const totalMins = Math.round(val * 24 * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  if (val instanceof Date) {
    const h = val.getHours();
    const m = val.getMinutes();
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }
  return String(val);
}

// Row index (2-based) of this event + phone in RSVPs, or -1.
function findRSVPRow(sheet, eventId, phone) {
  const last = sheet.getLastRow();
  if (last <= 1) return -1;
  const rows = sheet.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === String(eventId) && String(rows[i][3]) === String(phone)) return i + 2;
  }
  return -1;
}

// One writer at a time, so two saves can't both miss each other's row.
function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}


// ============================================================
//  GET
// ============================================================
function doGet(e) {
  try {
    const action = (e.parameter && e.parameter.action) ? e.parameter.action : "events";

    if (action === "events") return makeResponse({ ok: true, data: buildEventsData() });
    if (action === "rsvps")  return makeResponse({ ok: true, data: buildRSVPsData() });

    return makeResponse({ ok: false, error: "Unknown action" });
  } catch (err) {
    return makeResponse({ ok: false, error: err.message });
  }
}


// ============================================================
//  POST
// ============================================================
function doPost(e) {
  try {
    let body;
    try { body = JSON.parse(e.postData.contents); }
    catch (pe) { return makeResponse({ ok: false, error: "Bad JSON" }); }

    // ── SUPABASE WEBHOOK: new row in rsvp_inbox ─────────────
    // The body isn't trusted — processInbox reads the inbox itself with the service key.
    if (body.table === "rsvp_inbox") {
      return makeResponse({ ok: true, data: { copied: processInbox() } });
    }

    const { action, data } = body;
    if (!action || !data) return makeResponse({ ok: false, error: "Missing action or data" });

    // ── ADD EVENT ──────────────────────────────────────────
    if (action === "addEvent") {
      const sheet = getSheet(EVENTS_SHEET);
      sheet.appendRow([
        String(data.id        || ""),
        String(data.title     || ""),
        String(data.date      || ""),
        String(data.startTime || ""),
        String(data.endTime   || ""),
        String(data.location  || ""),
        String(data.game      || ""),
        String(data.level     || ""),
        parseInt(data.totalSlots) || 0,
        String(data.cost      || ""),
        new Date().toISOString(),
        String(data.link1     || ""),
        String(data.link2     || ""),
      ]);
      SpreadsheetApp.flush();
      try { syncGamesCache(); } catch (e) {}
      return makeResponse({ ok: true, data: { message: "Event added", id: data.id } });
    }

    // ── EDIT EVENT ─────────────────────────────────────────
    if (action === "editEvent") {
      const sheet = getSheet(EVENTS_SHEET);
      const last  = sheet.getLastRow();
      if (last <= 1) return makeResponse({ ok: false, error: "No events found" });
      const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      let rowIndex = -1;
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(data.id)) { rowIndex = i + 2; break; }
      }
      if (rowIndex === -1) return makeResponse({ ok: false, error: "Event not found" });
      sheet.getRange(rowIndex, 2, 1, 11).setValues([[
        String(data.title     || ""),
        String(data.date      || ""),
        String(data.startTime || ""),
        String(data.endTime   || ""),
        String(data.location  || ""),
        String(data.game      || ""),
        String(data.level     || ""),
        parseInt(data.totalSlots) || 0,
        String(data.cost      || ""),
        String(data.link1     || ""),
        String(data.link2     || ""),
      ]]);
      SpreadsheetApp.flush();
      try { syncGamesCache(); } catch (e) {}
      return makeResponse({ ok: true, data: { message: "Event updated" } });
    }

    // ── ADD RSVP (fallback when the website can't reach Supabase) ──
    if (action === "addRSVP") {
      const res = withLock(() => {
        const sheet = getSheet(RSVPS_SHEET);
        if (findRSVPRow(sheet, data.eventId, data.phone) !== -1) return { ok: false, error: "Already registered for this event." };
        sheet.appendRow([
          String(data.eventId   || ""),
          String(data.eventName || ""),
          String(data.name      || ""),
          String(data.phone     || ""),
          String(data.status    || "confirmed"),
          new Date().toISOString(),
          "",
        ]);
        SpreadsheetApp.flush();
        return { ok: true, data: { message: "RSVP saved", status: data.status } };
      });
      if (res.ok) { try { syncGamesCache(); } catch (e) {} }
      return makeResponse(res);
    }

    // ── REMOVE RSVP ────────────────────────────────────────
    if (action === "removeRSVP") {
      // Someone who registered seconds ago may still be in the inbox — copy it first.
      try { processInbox(); } catch (e) {}
      const res = withLock(() => {
        const sheet = getSheet(RSVPS_SHEET);
        const rowIndex = findRSVPRow(sheet, data.eventId, data.phone);
        if (rowIndex === -1) return { ok: false, error: "RSVP not found" };
        sheet.deleteRow(rowIndex);
        SpreadsheetApp.flush();
        return { ok: true, data: { message: "RSVP removed" } };
      });
      if (res.ok) { try { syncGamesCache(); } catch (e) {} }
      return makeResponse(res);
    }

    // ── MARK PAID ──────────────────────────────────────────
    if (action === "markPaid") {
      const sheet = getSheet(RSVPS_SHEET);
      const rowIndex = findRSVPRow(sheet, data.eventId, data.phone);
      if (rowIndex === -1) return makeResponse({ ok: false, error: "RSVP not found" });
      sheet.getRange(rowIndex, 7).setValue("Yes");
      SpreadsheetApp.flush();
      try { syncGamesCache(); } catch (e) {}
      return makeResponse({ ok: true, data: { message: "Marked as paid" } });
    }

    return makeResponse({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return makeResponse({ ok: false, error: err.message });
  }
}


// ============================================================
//  SUPABASE INBOX → RSVPs tab
// ============================================================
function sbFetch(method, path, payload) {
  const opts = {
    method: method,
    contentType: 'application/json',
    headers: { apikey: SB_SERVICE_KEY, Authorization: 'Bearer ' + SB_SERVICE_KEY, Prefer: 'return=minimal' },
    muteHttpExceptions: true,
  };
  if (payload) opts.payload = JSON.stringify(payload);
  const resp = UrlFetchApp.fetch(SB_URL + path, opts);
  if (resp.getResponseCode() >= 300) {
    throw new Error(method + ' ' + path.split('?')[0] + ' failed: HTTP ' + resp.getResponseCode() + ' — ' + resp.getContentText());
  }
  const text = resp.getContentText();
  return text ? JSON.parse(text) : null;
}

// Copies every unsynced inbox row into RSVPs (skipping anyone already there),
// marks them synced, then refreshes games_cache. Returns how many rows it handled.
function processInbox() {
  const n = withLock(() => {
    const rows = sbFetch('get', '/rest/v1/rsvp_inbox?synced=is.false&order=id&select=id,event_id,event_name,name,phone,status,created_at');
    if (!rows.length) return 0;

    const sheet = getSheet(RSVPS_SHEET);
    const last  = sheet.getLastRow();
    const have  = new Set(last > 1
      ? sheet.getRange(2, 1, last - 1, 4).getValues().map(r => String(r[0]) + '|' + String(r[3]))
      : []);
    const add = [];
    rows.forEach(r => {
      const key = String(r.event_id) + '|' + String(r.phone);
      if (have.has(key)) return;
      have.add(key);
      add.push([r.event_id, r.event_name, r.name, r.phone, r.status, r.created_at, ""]);
    });
    if (add.length) sheet.getRange(sheet.getLastRow() + 1, 1, add.length, 7).setValues(add);
    SpreadsheetApp.flush();

    sbFetch('patch', '/rest/v1/rsvp_inbox?id=in.(' + rows.map(r => r.id).join(',') + ')', { synced: true });
    return rows.length;
  });
  if (n) syncGamesCache();
  return n;
}


// ============================================================
//  SUPABASE CACHE — reads the sheets, pushes to games_cache
// ============================================================
function buildEventsData() {
  const sheet = getSheet(EVENTS_SHEET);
  const last  = sheet.getLastRow();
  if (last <= 1) return [];
  return sheet.getRange(2, 1, last - 1, 13).getValues()
    .filter(r => r[0] !== "" && r[0] !== null && r[0] !== undefined)
    .map(r => ({
      id:         String(r[0]),
      title:      String(r[1]),
      date:       toDateStr(r[2]),
      startTime:  toTimeStr(r[3]),
      endTime:    toTimeStr(r[4]),
      location:   String(r[5]),
      game:       String(r[6]),
      level:      String(r[7]),
      totalSlots: parseInt(r[8]) || 0,
      cost:       String(r[9] || ""),
      createdAt:  String(r[10]),
      link1:      String(r[11] || ""),
      link2:      String(r[12] || ""),
    }));
}

function buildRSVPsData() {
  const sheet = getSheet(RSVPS_SHEET);
  const last  = sheet.getLastRow();
  if (last <= 1) return [];
  return sheet.getRange(2, 1, last - 1, 7).getValues()
    .filter(r => r[0] !== "" && r[0] !== null && r[0] !== undefined)
    .map(r => ({
      eventId:   String(r[0]),
      eventName: String(r[1]),
      name:      String(r[2]),
      phone:     String(r[3]),
      status:    String(r[4] || "confirmed"),
      timestamp: String(r[5]),
      paid:      String(r[6] || ""),
    }));
}

function syncGamesCache() {
  const now  = new Date().toISOString();
  const rows = [
    { source: 'events', payload: buildEventsData(), updated_at: now },
    { source: 'rsvps',  payload: buildRSVPsData(),  updated_at: now },
  ];
  const resp = UrlFetchApp.fetch(SB_URL + '/rest/v1/games_cache', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: 'Bearer ' + SB_SERVICE_KEY,
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('games_cache upsert failed: HTTP ' + resp.getResponseCode() + ' — ' + resp.getContentText());
  }
}


// ============================================================
//  TRIGGERS — run installGamesTrigger() once from the editor
// ============================================================
// Every 5 min: copy anything a missed webhook left in the inbox, and refresh the cache.
function every5Min() {
  if (!processInbox()) syncGamesCache();
}

function installGamesTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['syncGamesCache', 'every5Min'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('every5Min').timeBased().everyMinutes(5).create();
  // Any edit, added or deleted row in the Sheet → games_cache within seconds.
  ScriptApp.newTrigger('syncGamesCache').forSpreadsheet(SS).onChange().create();
}
