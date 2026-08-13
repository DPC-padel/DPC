// ============================================================
//  Delhi//PadelCollective — Coaching config.js v3
//
//  Data layer: Google Sheet via Apps Script (see coaching Apps
//  Script). DPC is the bridge — players send a request, the coach
//  reaches out. No online payment. Prices shown are indicative.
//
//  Tabs: Locations, Coaches, Slots, Requests.
//  Set COACHING_API to your deployed /exec URL. Until then the page
//  runs in DEMO MODE with sample data so the flow can be tested.
// ============================================================

const COACHING_API = "https://script.google.com/macros/s/AKfycby8pq9xQ7tekBgjK-6lmSbpcZDaVodsIbdgNTYcxbBdPsWYzHDFbL-Qq1yqyq53P4zm/exec";

// Demo mode falls back to sample data until the API URL is set.
const DEMO_MODE = !COACHING_API || COACHING_API.indexOf("PASTE") !== -1;

// ── Session types ───────────────────────────────────────────
// Per-person price = coach.session_price / players.
const SESSION_TYPES = [
  { id: "1:1", label: "1:1 Private", players: 1 },
  { id: "1:2", label: "1:2 Duo",     players: 2 },
  { id: "1:3", label: "1:3 Trio",    players: 3 },
];

function sharePrice(sessionPrice, typeId) {
  const t = SESSION_TYPES.find(x => x.id === typeId);
  return Math.round(sessionPrice / t.players);
}

// Per-session level (a slot, not the coach — any coach can run any level).
const LEVELS = ["Beginner", "Intermediate", "Advanced"];

// ── Demo data ───────────────────────────────────────────────
const DEMO = {
  locations: [
    { id: "loc-sirifort",  name: "Siri Fort",     area: "South Delhi", courts: 2, maps_url: "https://maps.google.com/?q=Siri+Fort+Sports+Complex" },
    { id: "loc-rackonnect",name: "Rackonnect",    area: "Greater Kailash", courts: 3, maps_url: "https://maps.google.com/?q=Rackonnect+GK" },
    { id: "loc-vasant",    name: "Vasant Vihar",  area: "West Delhi",  courts: 1, maps_url: "https://maps.google.com/?q=Vasant+Vihar+Delhi" },
    { id: "loc-gurgaon",   name: "Gurgaon",       area: "Sector 43",   courts: 4, maps_url: "https://maps.google.com/?q=Gurgaon+padel" },
  ],
  // NOTE: `locations` here is demo-only (to filter coaches by location in
  // preview). The live sheet has no locations column — coaches available at a
  // location are derived from the Slots tab (coach_id + location_id).
  coaches: [
    { id: "coach-prannay", name: "Prannay Merchant", experience: "8 yrs",  level: "Advanced Coach",         photo: "", session_price: 4800, locations: ["loc-sirifort", "loc-rackonnect", "loc-gurgaon"] },
    { id: "coach-aditi",   name: "Aditi Rao",        experience: "5 yrs",  level: "Intermediate & Beginner", photo: "", session_price: 3600, locations: ["loc-sirifort", "loc-vasant"] },
    { id: "coach-karan",   name: "Karan Bhatia",     experience: "10 yrs", level: "Advanced Coach",         photo: "", session_price: 5400, locations: ["loc-gurgaon", "loc-rackonnect"] },
  ],
  // Weekly template: coach id → weekday (0=Sun) → start times
  availability: {
    "coach-prannay": { 1: ["17:00","18:00","19:30"], 2: ["17:00","18:00"], 3: ["17:00","18:00","19:30","20:30"], 5: ["07:00","08:00","17:00"], 6: ["07:00","08:00","09:00"] },
    "coach-aditi":   { 0: ["08:00","09:00","10:00"], 2: ["18:00","19:00"], 4: ["17:00","18:00","19:00"], 6: ["16:00","17:00","18:00"] },
    "coach-karan":   { 1: ["07:00","08:00"], 3: ["07:00","08:00"], 4: ["18:30","19:30","20:30"], 5: ["18:30","19:30"], 0: ["17:00","18:00"] },
  },
};

// demo group state (slot id → {session_type, capacity, spots_taken}) + bookings,
// in-memory for the session
const _demoGroups = {};
const _demoBookings = [];

// Deterministic pseudo-random seed so the demo shows a mix of slot states
function _demoSeed(dateStr, time) {
  return (parseInt(dateStr.replace(/-/g, ""), 10) + parseInt(time, 10) * 7) % 10;
}

// ── Helpers ─────────────────────────────────────────────────
function toDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime12(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function genBookingId() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `DPC-${Date.now().toString(36).toUpperCase().slice(-4)}${n}`;
}

// slot end time = start + 60 min
function endTimeOf(start) {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + 60);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── API (Google Sheet via Apps Script) ──────────────────────
// Slot shape returned by fetchSlots:
//   { id, date, start_time, end_time, level,
//     session_type, capacity, spots_taken,  // group model (unused in sheet)
//     status }                              // "open" | "full" | "blocked"
function getJSON(url) {
  return fetch(url).then(r => r.json());
}

// ── Supabase cache (reliable reads; Apps Script kept as fallback) ──
const SUPABASE = {
  url:     "https://zruqzybdpniofxbcwuat.supabase.co",
  anonKey: "sb_publishable_O5kl7By_s23gMXNULck-yw_cksU-9Oy",
};
let _coachCache = null;
async function loadCoachingCache() {
  if (_coachCache) return _coachCache;
  const res = await fetch(`${SUPABASE.url}/rest/v1/coaching_cache?select=source,payload`,
    { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` } });
  if (!res.ok) throw new Error("cache read failed");
  const c = { locations: [], coaches: [], slots: [] };
  (await res.json()).forEach(r => { if (c[r.source] !== undefined) c[r.source] = r.payload || []; });
  _coachCache = c;
  return c;
}

const API = {

  async fetchLocations() {
    if (DEMO_MODE) return DEMO.locations;
    try { return (await loadCoachingCache()).locations; }
    catch (e) { return getJSON(`${COACHING_API}?action=getLocations`); }
  },

  // Coaches with slots at this location.
  async fetchCoaches(locationId) {
    if (DEMO_MODE) return DEMO.coaches.filter(c => c.locations.includes(locationId));
    try {
      const c = await loadCoachingCache();
      const ids = new Set(c.slots.filter(s => String(s.location_id) === String(locationId)).map(s => String(s.coach_id)));
      return c.coaches.filter(co => ids.has(String(co.id)));
    } catch (e) {
      return getJSON(`${COACHING_API}?action=getCoaches&location=${encodeURIComponent(locationId)}`);
    }
  },

  // All coaches (coach-first flow).
  async fetchAllCoaches() {
    if (DEMO_MODE) return DEMO.coaches;
    try { return (await loadCoachingCache()).coaches; }
    catch (e) {
      const locs = await this.fetchLocations();
      const lists = await Promise.all(locs.map(l => this.fetchCoaches(l.id).catch(() => [])));
      const seen = {}, all = [];
      lists.flat().forEach(c => { if (c && c.id && !seen[c.id]) { seen[c.id] = 1; all.push(c); } });
      return all;
    }
  },

  // Returns { "YYYY-MM-DD": [slot, ...] } for one coach + location.
  async fetchSlots(coachId, locationId, days = 14) {
    if (DEMO_MODE) {
      const today = new Date();
      const byDate = {};
      const tmpl = DEMO.availability[coachId] || {};
      for (let i = 1; i <= days; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        const times = tmpl[d.getDay()] || [];
        if (!times.length) continue;
        const dateStr = toDateStr(d);
        byDate[dateStr] = times.map(t => {
          const id = `${coachId}|${locationId}|${dateStr}|${t}`;
          const level = LEVELS[(parseInt(t, 10) + parseInt(dateStr.slice(-2), 10)) % LEVELS.length];
          return { id, date: dateStr, start_time: t, end_time: endTimeOf(t), level,
                   session_type: null, capacity: 0, spots_taken: 0, status: "open" };
        });
      }
      return byDate;
    }
    try {
      const c = await loadCoachingCache();
      const byDate = {};
      c.slots
        .filter(s => String(s.coach_id) === String(coachId) && String(s.location_id) === String(locationId) && s.status === "open")
        .forEach(s => {
          (byDate[s.date] = byDate[s.date] || []).push({
            id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time,
            level: s.level, session_type: null, capacity: 0, spots_taken: 0, status: "open",
          });
        });
      return byDate;
    } catch (e) {
      return getJSON(`${COACHING_API}?action=getSlots&coach=${encodeURIComponent(coachId)}&location=${encodeURIComponent(locationId)}`);
    }
  },

  // Logs a coaching request. DPC is the bridge — no payment; the coach
  // reaches out. booking_id is generated client-side so the fire-and-forget
  // POST needs no CORS-readable response.
  async createBooking(b) {
    const booking = { ...b, booking_id: genBookingId(), booking_status: "requested", created_at: new Date().toISOString() };

    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 700));
      _demoBookings.push({ ...booking, demo: true });
      return booking;
    }

    try {
      await fetch(COACHING_API, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ action: "addRequest", ...booking }),
      });
    } catch (e) { /* fire-and-forget; the request is best-effort */ }
    return booking;
  },

  // Look up requests by phone (for "My Requests")
  async fetchBookings(phone) {
    if (DEMO_MODE) return _demoBookings.filter(b => b.phone === phone);
    return getJSON(`${COACHING_API}?action=getRequests&phone=${encodeURIComponent(phone)}`);
  },
};
