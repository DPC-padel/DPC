// ============================================================
//  Delhi//PadelCollective — config.js v4
// ============================================================

const CONFIG = {
  SCRIPT_URL:     "https://script.google.com/macros/s/AKfycbxiOz2Wyc4cnsrDlYdNyb9vw7q4kcqpvMkwIa03N4MRWcKr7E6IZ__721lJoB_ihavZFA/exec",
  ADMIN_PASSWORD: "padel2024",
};

const Sheets = {

  async fetchEvents() {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=events`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed to fetch events");
    return json.data;
  },

  async fetchRSVPs() {
    const res  = await fetch(`${CONFIG.SCRIPT_URL}?action=rsvps`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed to fetch RSVPs");
    return json.data;
  },

  async addEvent(ev) {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "addEvent", data: ev }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed to add event");
    return json.data;
  },

  async editEvent(ev) {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "editEvent", data: ev }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed to edit event");
    return json.data;
  },

  async addRSVP(rsvp) {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "addRSVP", data: rsvp }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || json.error);
    return json.data;
  },

  async removeRSVP(eventId, phone) {
    const res  = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST", headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "removeRSVP", data: { eventId, phone } }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Failed to remove RSVP");
    return json.data;
  },
};

// ── Utilities ──────────────────────────────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Date parsing ─────────────────────────────────────────────
// Parses dates coming back from the Sheet, which may arrive as:
//  - "YYYY-MM-DD"            (preferred)
//  - "YYYY-MM-DDTHH:mm:ss..." (ISO with time/timezone)
//  - "DD/MM/YYYY" or "D/M/YYYY" (Indian locale text dates)
//  - any other string Date() can parse natively
// Returns a Date object set to local midnight, or null if unparseable.
function parseSheetDate(dateStr) {
  if (dateStr === null || dateStr === undefined || dateStr === "") return null;

  if (dateStr instanceof Date) {
    return isNaN(dateStr.getTime()) ? null : dateStr;
  }

  const raw = String(dateStr).trim();
  if (!raw) return null;

  // YYYY-MM-DD (optionally followed by a time/timezone component)
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3])
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or D/M/YYYY (Indian locale)
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1])
    );
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback — let the JS engine try (handles things like
  // "Wed Jun 10 2026 00:00:00 GMT+0530 (India Standard Time)")
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(dateStr) {
  const d = parseSheetDate(dateStr);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function formatDateShort(dateStr) {
  const d = parseSheetDate(dateStr);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function normalizeTimeValue(timeStr) {
  if (!timeStr) return "";

  const raw = String(timeStr).trim();

  const hhmmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmmMatch) {
    return `${hhmmMatch[1].padStart(2, "0")}:${hhmmMatch[2]}`;
  }

  const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}:${isoMatch[2]}`;
  }

  return raw;
}

function formatTime(timeStr) {
  if (!timeStr && timeStr !== 0) return "";

  const raw = String(timeStr).trim();

  let h, m;

  // Google Sheets sometimes returns time as a decimal fraction of a day
  // e.g. 0.5 = 12:00, 0.75 = 18:00
  const asNum = Number(raw);
  if (!isNaN(asNum) && asNum >= 0 && asNum < 1) {
    const totalMins = Math.round(asNum * 24 * 60);
    h = Math.floor(totalMins / 60);
    m = totalMins % 60;
  }
  // HH:MM or HH:MM:SS
  else {
    const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmm) {
      h = Number(hhmm[1]);
      m = Number(hhmm[2]);
    } else {
      // ISO date string with time component
      const dateMatch = raw.match(/(\d{1,2}):(\d{2})/);
      if (!dateMatch) return "";
      h = Number(dateMatch[1]);
      m = Number(dateMatch[2]);
    }
  }

  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}



function formatTimeRange(start, end) {
  if (!start) return "";
  if (!end)   return formatTime(start);
  return `${formatTime(start)} – ${formatTime(end)}`;
}

// Get day label like "Wednesday, 29th April"
function formatDayLabel(dateStr) {
  const d = parseSheetDate(dateStr);
  if (!d) return "";
  const weekday = d.toLocaleDateString("en-IN", { weekday: "long" });
  const day     = d.getDate();
  const suffix  = day === 1 || day === 21 || day === 31 ? "st"
                : day === 2 || day === 22 ? "nd"
                : day === 3 || day === 23 ? "rd" : "th";
  const month   = d.toLocaleDateString("en-IN", { month: "long" });
  return `${weekday}, ${day}${suffix} ${month}`;
}
