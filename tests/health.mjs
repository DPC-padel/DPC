// Live health check — runs every 2 days on this Mac (see tests/README.md), or by hand:
//   node tests/health.mjs
// 1. offline unit tests
// 2. every public page loads
// 3. every Apps Script and Supabase source answers, and the caches are fresh
// 4. real saves: a waitlist registration (removed straight after) and one
//    application (leaves a "DPC HEALTHCHECK" row in the response sheet to delete)
// Any failure is emailed through the "DPC Errors" script (URL read from errors.js).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { ROOT } from "./lib/harness.mjs";

const SITE = "https://www.padelcollectiveindia.com";
const TEST_PHONE = "1000000001";   // not a real Indian mobile; no leading zero, so Sheets keeps it as typed
const src = (f) => readFileSync(ROOT + f, "utf8");
const pick = (file, re, what) => {
  const m = src(file).match(re);
  if (!m) throw new Error(`health: ${what} not found in ${file}`);
  return m[1];
};

// Endpoints come from the shipped pages, so this checks what players actually hit.
const ERRORS_URL   = pick("errors.js", /const DPC_ERRORS_URL = "([^"]*)"/, "DPC_ERRORS_URL");
const GAMES_API    = pick("calender/config.js", /SCRIPT_URL:\s*"([^"]+)"/, "games SCRIPT_URL");
const APP_API      = pick("Application/index.html", /const SCRIPT_URL = "([^"]+)"/, "Application SCRIPT_URL");
const MATCHES_API  = pick("Dashboard/index.html", /const MATCHES_API = '([^']+)'/, "MATCHES_API");
const PLAYERS_API  = pick("login/index.html", /const PLAYERS_API\s*=\s*'([^']+)'/, "PLAYERS_API");
const COACHING_API = pick("coaching/config.js", /const COACHING_API = "([^"]+)"/, "COACHING_API");
const FIN_API      = pick("founder/index.html", /FIN_API:\s*"([^"]+)"/, "FIN_API");
const FIN_TOKEN    = pick("founder/index.html", /FIN_TOKEN:\s*"([^"]+)"/, "FIN_TOKEN");
const SB_URL       = pick("calender/config.js", /url:\s*"(https:\/\/[^"]+\.supabase\.co)"/, "Supabase url");
const SB_KEY       = pick("calender/config.js", /anonKey:\s*"([^"]+)"/, "Supabase key");
const BOARDS = Object.fromEntries([...src("leaderboard/script.js").matchAll(/(firstServe|breakPoint|matchPoint|noida):\s*"(https:\/\/script\.google\.com[^"]+)"/g)].map((m) => [m[1], m[2]]));

const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try { results.push({ name, ok: true, note: (await fn()) || "", ms: Date.now() - t0 }); }
  catch (e) { results.push({ name, ok: false, note: e.message, ms: Date.now() - t0 }); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notJSON = (text) => new Error("not JSON: " + text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120));

// Apps Script sometimes answers with an HTML error page — retry reads before calling a source down.
async function getJSON(url, { tries = 3, headers } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(90000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { return JSON.parse(text); } catch { throw notJSON(text); }
    } catch (e) { last = e; if (i < tries - 1) await sleep(2000 * (i + 1)); }
  }
  throw last;
}
async function postJSON(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw notJSON(text); }
}
const sb = (path) => getJSON(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
const minutesOld = (iso) => Math.round((Date.now() - Date.parse(iso)) / 60000);

// 1 ── offline unit tests
await check("Unit tests", () => {
  const r = spawnSync(process.execPath, [ROOT + "tests/run.mjs"], { encoding: "utf8" });
  const summary = (r.stdout.match(/\d+ passed, \d+ failed/) || ["no summary"])[0];
  if (r.status !== 0) {
    const failed = [...r.stdout.matchAll(/^ {3}✗ (.+)$/gm)].map((m) => m[1]);
    const unloaded = [...r.stdout.matchAll(/^! could not load (.+)$/gm)].map((m) => "could not load " + m[1]);
    throw new Error(`${summary}: ${[...unloaded, ...failed].slice(0, 10).join("; ")}`);
  }
  return summary;
});

// 2 ── pages
const PAGES = ["/", "/login/", "/Application/", "/Dashboard/", "/calender/", "/coaching/", "/founder/", "/leaderboard/",
  "/leaderboard/breakpoint.html", "/leaderboard/matchpoint.html", "/leaderboard/noida.html", "/leaderboard/girls.html", "/leaderboard/explainer.html"];
await check(`Website: ${PAGES.length} pages load`, async () => {
  const bad = [];
  await Promise.all(PAGES.map(async (p) => {
    try {
      const res = await fetch(`${SITE}${p}?health=${Date.now()}`, { signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      if (!res.ok || !/<title>/i.test(text)) bad.push(`${p} (HTTP ${res.status})`);
    } catch (e) { bad.push(`${p} (${e.message})`); }
  }));
  if (bad.length) throw new Error("not loading: " + bad.join(", "));
  return "all load";
});

// 3 ── data sources and caches
await Promise.all([
  check("Games script: events", async () => {
    const d = await getJSON(`${GAMES_API}?action=events`);
    if (!d.ok || !Array.isArray(d.data)) throw new Error(d.error || "no events list");
    return `${d.data.length} events`;
  }),
  check("Games script: registrations", async () => {
    const d = await getJSON(`${GAMES_API}?action=rsvps`);
    if (!d.ok || !Array.isArray(d.data)) throw new Error(d.error || "no registrations list");
    return `${d.data.length} registrations`;
  }),
  check("Matches script (dashboards)", async () => {
    const d = await getJSON(`${MATCHES_API}?action=getPlayerMatches&phone=${TEST_PHONE}`);
    if (typeof d.success !== "boolean") throw new Error("unexpected reply");
    return "answers";
  }),
  check("Players script (login)", async () => {
    const d = await getJSON(`${PLAYERS_API}?action=getPlayer&phone=${TEST_PHONE}`);
    if (typeof d.success !== "boolean") throw new Error("unexpected reply");
    return "answers";
  }),
  check("Coaching script", async () => {
    const d = await getJSON(`${COACHING_API}?action=getLocations`);
    if (!Array.isArray(d)) throw new Error("no locations list");
    return `${d.length} courts`;
  }),
  check("Founder financials script", async () => {
    const d = await getJSON(`${FIN_API}?action=getFinancials&token=${encodeURIComponent(FIN_TOKEN)}`);
    if (!d.ok) throw new Error(d.error || "ok:false");
    return `FY ${d.fy}`;
  }),
  ...Object.entries(BOARDS).map(([name, url]) => check(`Leaderboard script: ${name}`, async () => { await getJSON(url); return "answers"; })),
  check("Games cache is fresh (every 5 min)", async () => {
    const rows = await sb("games_cache?select=source,updated_at");
    if (!rows.length) throw new Error("empty");
    const old = Math.max(...rows.map((r) => minutesOld(r.updated_at)));
    if (old > 15) throw new Error(`last updated ${old} min ago`);
    return `${old} min old`;
  }),
  check("Leaderboard cache is fresh (hourly)", async () => {
    const rows = await sb("leaderboard_cache?select=source,updated_at");
    const missing = ["firstServe", "breakPoint", "matchPoint", "noida"].filter((s) => !rows.some((r) => r.source === s));
    if (missing.length) throw new Error("missing " + missing.join(", "));
    const old = Math.max(...rows.map((r) => minutesOld(r.updated_at)));
    if (old > 120) throw new Error(`last updated ${old} min ago`);
    return `${old} min old`;
  }),
  check("Dashboard cache is fresh (hourly)", async () => {
    const rows = await sb("dashboard_cache?select=updated_at&order=updated_at.desc&limit=1");
    if (!rows.length) throw new Error("empty");
    const old = minutesOld(rows[0].updated_at);
    if (old > 120) throw new Error(`last updated ${Math.round(old / 60)} h ago — the hourly dashboard sync isn't running`);
    return `${old} min old`;
  }),
  check("Coaching cache has coaches and slots", async () => {
    const rows = await sb("coaching_cache?select=source");
    if (!rows.some((r) => r.source === "coaches") || !rows.some((r) => r.source === "slots")) throw new Error("coaches or slots missing");
    return `${rows.length} tables`;
  }),
]);

// 4 ── real saves
await check("Save: game registration (waitlist, removed straight after)", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const ev = (await getJSON(`${GAMES_API}?action=events`)).data
    .filter((e) => String(e.date) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  if (!ev) return "skipped: no upcoming event to register on";
  const add = await postJSON(GAMES_API, { action: "addRSVP", data: { eventId: ev.id, eventName: ev.title, name: "DPC HEALTHCHECK", phone: TEST_PHONE, status: "waitlist" } });
  if (!add.ok && !/already registered/i.test(add.error || "")) throw new Error("registering failed: " + (add.error || "ok:false"));
  const del = await postJSON(GAMES_API, { action: "removeRSVP", data: { eventId: ev.id, phone: TEST_PHONE } });
  if (!del.ok) throw new Error(`removing failed: ${del.error || "ok:false"}. Delete "DPC HEALTHCHECK" from "${ev.title}" by hand`);
  return `on "${ev.title}"`;
});

await check("Save: application form (leaves a DPC HEALTHCHECK row)", async () => {
  const d = await postJSON(APP_API, {
    name: "DPC HEALTHCHECK", phone: TEST_PHONE, location: "Health check", experience: "0-3 months", level: "Beginner",
    wallPlay: "N/A", serveQuality: "N/A", smashAbility: "N/A", doublesCoord: "N/A", returnOfServe: "N/A",
    onboardingRating: "1 / 7.0", gender: "Prefer not to say", girl: false, rating: 1,
    communityValue: "Health check", instagram: "-", instagramFollowing: "No", vision: "Automatic health check. Safe to delete.",
  });
  if (d.ok !== true) throw new Error(d.error || "the reply wasn't {ok:true}");
  return "saved";
});

// ── report ──
const failed = results.filter((r) => !r.ok);
const width = Math.max(...results.map((r) => r.name.length));
console.log(`\nDPC health check · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n`);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(width)}  ${r.note}  (${(r.ms / 1000).toFixed(1)}s)`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);

if (failed.length) {
  process.exitCode = 1;
  if (!ERRORS_URL) console.log("No alert sent: DPC_ERRORS_URL in errors.js is empty.");
  else {
    try {
      await postJSON(ERRORS_URL, {
        kind: "health", page: "health check",
        message: `${failed.length} of ${results.length} checks failed: ${failed.map((f) => f.name).join(", ")}`.slice(0, 900),
        detail: failed.map((f) => `✗ ${f.name}: ${f.note}`).join("\n"),
        userAgent: `node ${process.version} on ${process.platform}`,
      });
      console.log("Alert emailed.");
    } catch (e) { console.log("Couldn't send the alert: " + e.message); }
  }
}
