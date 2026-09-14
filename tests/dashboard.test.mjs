// Dashboard: rating/ranking history, the match list, and the data layer
// (Supabase cache → Apps Script fallback → rating/ranking from the Master venue's board).
import { readFileSync } from "node:fs";
import { ROOT, extractFns, suite, test, ok, eq } from "./lib/harness.mjs";

const html = readFileSync(ROOT + "Dashboard/index.html", "utf8");

function helpers(state = {}) {
  const pre = "var allMatches = __s.allMatches || [], activeFilters = __s.activeFilters || { date: 'all', type: 'all' }, currentPlayer = __s.currentPlayer || null, matchNos = new Map();";
  return new Function("__s", pre + "\n" +
    extractFns("Dashboard/index.html", ["parseHistory", "monthlyAvg", "getFiltered", "numberMatches", "playerInRecords", "initialsOf"]) +
    "\nreturn { parseHistory, monthlyAvg, getFiltered, playerInRecords, initialsOf, numbers: () => { numberMatches(); return matchNos; } };")(state);
}
const H = helpers();
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

suite("Dashboard · rating and ranking history");

test("reads 'DD.MM.YYYY, value; …' from the sheet", () => {
  const rows = H.parseHistory("27.05.2026, 3; 04.06.2026, 3.1");
  eq(rows.map((r) => [r.d.getFullYear(), r.d.getMonth() + 1, r.d.getDate(), r.v]), [[2026, 5, 27, 3], [2026, 6, 4, 3.1]]);
});
test("two-digit years are 20xx", () => eq(H.parseHistory("04.06.26, 2")[0].d.getFullYear(), 2026));
test("a blank value becomes null; junk entries are skipped", () => {
  const rows = H.parseHistory("07.09.2026, ; nonsense; ; 10.09.2026, 2.17");
  eq([rows.length, rows[0].v, rows[1].v], [2, null, 2.17]);
});
test("no history gives an empty chart, not a crash", () => {
  eq(H.parseHistory(""), []);
  eq(H.parseHistory(null), []);
});
test("several syncs in one month average into one point", () => {
  const out = H.monthlyAvg([{ d: new Date(2026, 8, 7), v: 2 }, { d: new Date(2026, 8, 10), v: 3 }]);
  eq([out.length, out[0].value], [1, 2.5]);
});
test("keeps only the last 4 months, oldest first", () => {
  const rows = [3, 4, 5, 6, 7, 8].map((m) => ({ d: new Date(2026, m, 1), v: m }));
  eq(H.monthlyAvg(rows).map((x) => x.value), [5, 6, 7, 8]);
});
test("null values and invalid dates are ignored", () => {
  eq(H.monthlyAvg([{ d: new Date(2026, 1, 1), v: null }, { d: new Date("x"), v: 3 }]), []);
});
test("labels show the year only when the chart spans two years", () => {
  const same = H.monthlyAvg([{ d: new Date(2026, 7, 1), v: 1 }, { d: new Date(2026, 8, 1), v: 1 }]);
  ok(same.every((x) => !/\d/.test(x.label)), JSON.stringify(same));
  const span = H.monthlyAvg([{ d: new Date(2025, 11, 1), v: 1 }, { d: new Date(2026, 0, 1), v: 1 }]);
  ok(/25/.test(span[0].label) && /26/.test(span[1].label), JSON.stringify(span));
});

suite("Dashboard · match list");

test("'last 30 days' drops older matches but keeps undated ones", () => {
  const D = helpers({ activeFilters: { date: "30", type: "all" },
    allMatches: [{ matchId: "FSAM1", date: daysAgo(5) }, { matchId: "FSAM2", date: daysAgo(45) }, { matchId: "FSAM3", date: "" }] });
  eq(D.getFiltered().map((m) => m.matchId).sort(), ["FSAM1", "FSAM3"]);
});
test("the type filter matches the code inside the match id", () => {
  const D = helpers({ activeFilters: { date: "all", type: "TM" },
    allMatches: [{ matchId: "FSAM020", date: daysAgo(1) }, { matchId: "FSTM003", date: daysAgo(2) }] });
  eq(D.getFiltered().map((m) => m.matchId), ["FSTM003"]);
});
test("newest first, undated last", () => {
  const D = helpers({ allMatches: [{ matchId: "old", date: daysAgo(9) }, { matchId: "none", date: "" }, { matchId: "new", date: daysAgo(1) }] });
  eq(D.getFiltered().map((m) => m.matchId), ["new", "old", "none"]);
});
test("matches sharing a tournament code are numbered 1, 2, 3 in play order", () => {
  const ms = [{ matchId: "FSTM003" }, { matchId: "FSAM020" }, { matchId: "fstm003" }, { matchId: "FSTM003" }];
  const nos = helpers({ allMatches: ms }).numbers();
  eq(ms.map((m) => nos.get(m)), [1, 1, 2, 3]);
});
test("a rating, ranking or Americano points means 'in our records'", () => {
  ok(helpers({ currentPlayer: { rating: 2.45 } }).playerInRecords());
  ok(helpers({ currentPlayer: { ranking: 10 } }).playerInRecords());
  ok(helpers({ currentPlayer: {}, allMatches: [{ total: 81 }] }).playerInRecords());
  ok(!helpers({ currentPlayer: { rating: 0, ranking: null } }).playerInRecords());
  ok(!helpers({ currentPlayer: null }).playerInRecords());
});
test("avatar initials, and no crash for a player without a name", () => {
  eq([H.initialsOf("Karan Sehgal"), H.initialsOf("Gobind"), H.initialsOf(""), H.initialsOf(null)], ["KS", "GO", "?", "?"]);
});

// ── data layer, evaluated from the page with a fake network and storage ──
function dataLayer({ fetchImpl, store = new Map() }) {
  const s = html.indexOf("let currentPlayer = null;"), e = html.indexOf("async function bootstrapDashboard");
  if (s < 0 || e < 0) throw new Error("dashboard.test: data layer not found in Dashboard/index.html");
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  return new Function("localStorage", "fetch", "window", html.slice(s, e) +
    "\nreturn { saveCache, loadCache, clearDataCache, hasPlayerData, fetchLeaderboardStats, fetchFromAPI };")(localStorage, fetchImpl, { DPC: { report() {}, toast() {} } });
}

suite("Dashboard · saved data on the phone");

test("data saved before the rating change is ignored and refetched once", () => {
  const store = new Map([["dpcCache_player", '{"rating":2.3}'], ["dpcCache_matches", "[]"], ["dpcCache_savedAt", String(Date.now())], ["dpcCache_phone", "9000000001"]]);
  eq(dataLayer({ fetchImpl: null, store }).loadCache("9000000001"), null);
});
test("data saved by the current version loads", () => {
  const D = dataLayer({ fetchImpl: null });
  D.saveCache("9000000001", { rating: 2.45 }, [{ matchId: "FSAM020" }]);
  eq(D.loadCache("9000000001"), { player: { rating: 2.45 }, matches: [{ matchId: "FSAM020" }] });
});
test("one player's saved data is never shown for another number", () => {
  const D = dataLayer({ fetchImpl: null });
  D.saveCache("9000000001", { rating: 2.45 }, []);
  eq(D.loadCache("9000000004"), null);
});
test("an empty saved copy is ignored rather than showing 'Player not found'", () => {
  const D = dataLayer({ fetchImpl: null });
  D.saveCache("9000000001", {}, []);
  eq(D.loadCache("9000000001"), null);
});

suite("Dashboard · rating and ranking from the leaderboard");

const board = (rows) => async () => ({ ok: true, json: async () => [{ payload: { rankings: rows } }] });

test("rank counts only players with 2+ matches; names match loosely", async () => {
  const D = dataLayer({ fetchImpl: board([
    { Name: "Top", Rating: 3.5, Ranking: 1, "Matches played": 5 },
    { Name: "Newbie", Rating: 3.4, Ranking: 2, "Matches played": 1 },
    { Name: "Karan Sehgal", Rating: 2.45, Ranking: 3, "Matches played": 6 },
  ]) });
  eq(await D.fetchLeaderboardStats("  karan sehgal ", "First Serve"), { rating: 2.45, ranking: 2 });
  eq(await D.fetchLeaderboardStats("Newbie", "First Serve"), { rating: 3.4, ranking: null });
});
test("unknown venue, missing player or a failed request give nothing", async () => {
  const D = dataLayer({ fetchImpl: board([{ Name: "A", Rating: 3, Ranking: 1, "Matches played": 3 }]) });
  eq(await D.fetchLeaderboardStats("A", "Mars"), null);
  eq(await D.fetchLeaderboardStats("Nobody", "Break Point"), null);
  const down = dataLayer({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  eq(await down.fetchLeaderboardStats("A", "First Serve"), null);
});

// A fake internet: Supabase dashboard row, leaderboard boards, and the Apps Script fallback.
function site({ cacheRow, boards = {}, appsScript }) {
  return async (url) => {
    const u = String(url);
    if (u.includes("dashboard_cache")) {
      if (!cacheRow) throw new TypeError("Failed to fetch");
      return { ok: true, json: async () => [cacheRow] };
    }
    if (u.includes("leaderboard_cache")) {
      const src = u.match(/source=eq\.(\w+)/)[1];
      return { ok: true, json: async () => [{ payload: { rankings: boards[src] || [] } }] };
    }
    if (!appsScript) throw new TypeError("Failed to fetch");
    if (u.includes("action=getPlayer&")) return { json: async () => appsScript.player };
    if (u.includes("action=getPlayerMatches")) return { json: async () => appsScript.matches };
    throw new Error("unexpected url " + u);
  };
}

suite("Dashboard · loading a player");

test("rating comes from the Master venue's board, not the latest match's (Amaya)", async () => {
  const D = dataLayer({ fetchImpl: site({
    cacheRow: { phone: "9000000003", player: { name: "Amaya", venue: "Breakpoint", rating: 3.33, ranking: 26 },
      matches: [{ matchId: "FSAM020", venue: "First Serve", playerName: "Amaya" }, { matchId: "BPAM021", venue: "Breakpoint", playerName: "Amaya" }] },
    boards: {
      breakPoint: [{ Name: "Amaya", Rating: 3.33, Ranking: 1, "Matches played": 9 }],
      firstServe: [{ Name: "Amaya", Rating: 2.0, Ranking: 1, "Matches played": 1 }],
    },
  }) });
  const { player, ok: fetched } = await D.fetchFromAPI("9000000003");
  eq([fetched, player.venue, player.rating, player.ranking], [true, "Breakpoint", 3.33, 1]);
});
test("the board's spelling comes from a match at the home venue (Ranbir S)", async () => {
  const D = dataLayer({ fetchImpl: site({
    cacheRow: { phone: "1", player: { name: "Ranbir Sawhney", venue: "Breakpoint" },
      matches: [{ matchId: "FSAM1", venue: "First Serve", playerName: "Ranbir Sawhney" }, { matchId: "BPAM1", venue: "Breakpoint", playerName: "Ranbir S" }] },
    boards: { breakPoint: [{ Name: "Ranbir S", Rating: 3.59, Ranking: 1, "Matches played": 4 }] },
  }) });
  const { player } = await D.fetchFromAPI("1");
  eq([player.boardName, player.rating], ["Ranbir S", 3.59]);
});
test("no Master venue: the latest match's venue is used", async () => {
  const D = dataLayer({ fetchImpl: site({
    cacheRow: { phone: "2", player: { name: "X", venue: "" }, matches: [{ matchId: "FSAM1", venue: "First Serve", playerName: "X" }] },
    boards: { firstServe: [{ Name: "X", Rating: 2.2, Ranking: 1, "Matches played": 2 }] },
  }) });
  const { player } = await D.fetchFromAPI("2");
  eq([player.venue, player.rating], ["First Serve", 2.2]);
});
test("Supabase down: falls back to Apps Script and still loads", async () => {
  const D = dataLayer({ fetchImpl: site({
    cacheRow: null,
    appsScript: {
      player: { success: true, player: { name: "Karan Sehgal", venue: "First Serve", rating: 2.34 } },
      matches: { success: true, matches: [{ matchId: "FSAM020", venue: "First Serve", playerName: "Karan Sehgal" }] },
    },
    boards: { firstServe: [{ Name: "Karan Sehgal", Rating: 2.45, Ranking: 1, "Matches played": 6 }] },
  }) });
  const { player, matches, ok: fetched } = await D.fetchFromAPI("9000000001");
  eq([fetched, matches.length, player.rating], [true, 1, 2.45]);
});
test("everything down: reports 'couldn't load' rather than 'player not found'", async () => {
  const D = dataLayer({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  eq((await D.fetchFromAPI("9000000001")).ok, false);
});
