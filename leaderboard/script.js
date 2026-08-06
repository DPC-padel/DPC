const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MASTER_CACHE_KEY = "dpcRankingCache:all-pages";
const CACHE_SCHEMA_VERSION = 8; // bumped to bust old cache after tournament addition
const ADMIN_STORAGE_KEY = "dpcRankingAdmin";
const ADMIN_QUERY_KEY = "admin";
const ADMIN_QUERY_VALUE = "1";

const PAGE_CONFIG = {
  "first-serve": {
    selectorValue: "index.html",
    refreshText: "Refresh",
    loader: loadFirstServePage
  },
  "break-point": {
    selectorValue: "breakpoint.html",
    refreshText: "Refresh All",
    loader: loadBreakPointPage
  },
  "match-point": {
    selectorValue: "matchpoint.html",
    refreshText: "Refresh All",
    loader: loadMatchPointPage
  },
  "noida": {
    selectorValue: "noida.html",
    refreshText: "Refresh",
    loader: loadNoidaPage
  }
};

const API_URLS = {
  firstServe: "https://script.google.com/macros/s/AKfycbyUACkr6V5Kn4yla7Wv6vIJ6cNXoxtHR4yFYrXS66uHfhumDjgIJVzOFpuMZK3o5uGa/exec",
  breakPoint: "https://script.google.com/macros/s/AKfycbxz0ee4RK4niCcg0lVwmktJKoCmy6lP3q9O5c6Md41m6AElQcxRN-wU810bkCbYVsk8/exec",
  matchPoint: "https://script.google.com/macros/s/AKfycbz0EuOkKQvC7F2BAjymJQEoGF1qmglQRnP07eqMrLmECTXSZrXj-PpvDZ18cBeLrRHF6A/exec",
  noida: "https://script.google.com/macros/s/AKfycbyum4imblCdj5mFLbr-zDFthSM8Am0f-1DrEVgdF7jioZueooMguFDgy5GX7V_3yRNH/exec"
};

// Fast path: read the JSON cache from Supabase (~100ms, CDN-cached)
// instead of the 4 slow Apps Script endpoints. Paste your project
// URL + anon key to activate; until then the site uses API_URLS as
// before. The Apps Script endpoints remain the automatic fallback
// if Supabase is unreachable, so the board never goes dark.
const SUPABASE = {
  url: "https://zruqzybdpniofxbcwuat.supabase.co",
  anonKey: "sb_publishable_O5kl7By_s23gMXNULck-yw_cksU-9Oy"
};
const SUPABASE_READY = !SUPABASE.url.startsWith("YOUR_");

const page = document.body.dataset.page;
const config = PAGE_CONFIG[page];

const elements = {
  statusMessage:              document.getElementById("statusMessage"),
  refreshButton:              document.getElementById("refreshButton"),
  pageSelector:               document.getElementById("pageSelector"),
  rankingBody:                document.getElementById("rankingBody"),
  firstServeRankingBody:      document.getElementById("firstServeRankingBody"),
  personalRankingBody:        document.getElementById("personalRankingBody"),
  firstServeTournamentBody:   document.getElementById("firstServeTournamentBody"),
  overallRankingBody:         document.getElementById("overallRankingBody"),
  tournamentRankingBody:      document.getElementById("tournamentRankingBody"),
  americanoRankingBody:       document.getElementById("americanoRankingBody"),
  // First Serve tabs
  firstServeRankingTab:       document.getElementById("firstServeRankingTab"),
  firstServeOverallTab:       document.getElementById("firstServeOverallTab"),
  firstServePersonalTab:      document.getElementById("firstServePersonalTab"),
  firstServeTournamentTab:    document.getElementById("firstServeTournamentTab"),
  // First Serve panels
  firstServeRankingPanel:     document.getElementById("firstServeRankingPanel"),
  firstServeOverallPanel:     document.getElementById("firstServeOverallPanel"),
  firstServePersonalPanel:    document.getElementById("firstServePersonalPanel"),
  firstServeTournamentPanel:  document.getElementById("firstServeTournamentPanel"),
  // Break Point tabs/panels
  overallTab:     document.getElementById("overallTab"),
  tournamentTab:  document.getElementById("tournamentTab"),
  americanoTab:   document.getElementById("americanoTab"),
  overallPanel:   document.getElementById("overallPanel"),
  tournamentPanel: document.getElementById("tournamentPanel"),
  americanoPanel: document.getElementById("americanoPanel")
};

const DEFAULT_VISIBLE_RANKINGS = 50;
const tableSearchState = new Map();

document.addEventListener("DOMContentLoaded", async () => {
  initPageSelector();
  initAdminMode();
  initFirstServeTabs();
  initBreakPointTabs();
  elements.refreshButton?.addEventListener("click", async () => {
    await config?.loader(true);
    // Consume this fetch; a later Refresh click pulls live data again.
    pendingFetch = null;
  });
  await config?.loader(false);
  await applyDeepLinkSearch();
  injectInfoButton();
  revalidateInBackground();
});

function initPageSelector() {
  if (!elements.pageSelector || !config) return;
  elements.pageSelector.value = config.selectorValue;
  elements.pageSelector.addEventListener("change", (event) => {
    window.location.href = event.target.value;
  });
}

function initAdminMode() {
  if (!elements.refreshButton || !config) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get(ADMIN_QUERY_KEY) === ADMIN_QUERY_VALUE) {
    window.localStorage.setItem(ADMIN_STORAGE_KEY, "true");
  }
  elements.refreshButton.hidden = false;
  elements.refreshButton.title = config.refreshText;
}

// ─── PAGE LOADERS ────────────────────────────────────────────────────────────

async function loadFirstServePage(isManualRefresh) {
  setLoadingState(true);
  updateStatus(isManualRefresh ? "Refreshing leaderboard..." : "");
  try {
    const data = await getAllRankingsData(isManualRefresh);
    const overallRankings     = normalizeFlexibleOverallRankings(data.firstServeRanking);
    const americanoRankings   = normalizeAmericanoRankings(data.firstServe);
    const personalGamesRankings = normalizeBasicRankings(data.firstServePersonal);
    const tournamentRankings  = normalizeTournamentRankings(data.firstServeTournament);

    if (!overallRankings.length && !americanoRankings.length && !personalGamesRankings.length) {
      throw new Error("No ranking entries were found.");
    }

    renderOverallTable(elements.firstServeRankingBody, overallRankings, 4);
    renderBasicTable(elements.rankingBody, americanoRankings, 4, "No Americano entries yet.");
    renderBasicTable(elements.personalRankingBody, personalGamesRankings, 4, "No personal matches entries yet.");
    renderTournamentTable(elements.firstServeTournamentBody, tournamentRankings, 6, "No tournament entries yet.");

    updateStatus("");
  } catch (error) {
    console.error("Failed to load First Serve rankings:", error);
    renderMessageRow(elements.firstServeRankingBody, "Ranking data is not available right now.", 4);
    renderMessageRow(elements.rankingBody, "Americano leaderboard is not available right now.", 4);
    renderMessageRow(elements.personalRankingBody, "Personal matches leaderboard is not available right now.", 4);
    renderMessageRow(elements.firstServeTournamentBody, "Tournament leaderboard is not available right now.", 6);
    updateStatus("Could not load the live leaderboard right now.", true);
  } finally {
    setLoadingState(false);
  }
}

async function loadBreakPointPage(isManualRefresh) {
  setLoadingState(true);
  updateStatus(isManualRefresh ? "Refreshing rankings..." : "");
  try {
    const data = await getAllRankingsData(isManualRefresh);
    const overallRankings     = normalizeOverallRankings(data.breakPointOverall);
    const tournamentRankings  = normalizeTournamentRankings(data.breakPointTournament);
    const americanoRankings   = normalizeAmericanoRankings(data.breakPointAmericano);

    if (!overallRankings.length && !tournamentRankings.length && !americanoRankings.length) {
      throw new Error("No Break Point rankings were found.");
    }

    renderOverallTable(elements.overallRankingBody, overallRankings, 4);
    renderTournamentTable(elements.tournamentRankingBody, tournamentRankings, 6);
    renderBasicTable(elements.americanoRankingBody, americanoRankings, 4, "No Americano entries yet.");
    updateStatus("");
  } catch (error) {
    console.error("Failed to load Break Point rankings:", error);
    renderMessageRow(elements.overallRankingBody, "Overall leaderboard is not available right now.", 4);
    renderMessageRow(elements.tournamentRankingBody, "Tournament leaderboard is not available right now.", 6);
    renderMessageRow(elements.americanoRankingBody, "Americano leaderboard is not available right now.", 4);
    updateStatus("Could not load the live rankings right now.", true);
  } finally {
    setLoadingState(false);
  }
}

async function loadMatchPointPage(isManualRefresh) {
  setLoadingState(true);
  updateStatus(isManualRefresh ? "Refreshing rankings..." : "");
  try {
    const data = await getAllRankingsData(isManualRefresh);
    const overallRankings = normalizeMatchPointRankings(data.matchPointPlayers);
    if (!overallRankings.length) throw new Error("No Match Point rankings were found.");
    renderOverallTable(elements.overallRankingBody, overallRankings, 4);
    updateStatus("");
  } catch (error) {
    console.error("Failed to load Match Point rankings:", error);
    renderMessageRow(elements.overallRankingBody, "Overall leaderboard is not available right now.", 4);
    updateStatus("Could not load the live rankings right now.", true);
  } finally {
    setLoadingState(false);
  }
}

async function loadNoidaPage(isManualRefresh) {
  setLoadingState(true);
  updateStatus(isManualRefresh ? "Refreshing leaderboard..." : "");
  try {
    const data = await getAllRankingsData(isManualRefresh);
    const rankings = normalizeNoidaRankings(data.noida);
    if (!rankings.length) throw new Error("No Noida ranking entries were found.");
    renderOverallTable(elements.rankingBody, rankings, 4);
    updateStatus("");
  } catch (error) {
    console.error("Failed to load Noida rankings:", error);
    renderMessageRow(elements.rankingBody, "Leaderboard data is not available right now.", 4);
    updateStatus("Could not load the live leaderboard right now.", true);
  } finally {
    setLoadingState(false);
  }
}

// ─── DATA FETCHING ───────────────────────────────────────────────────────────

let pendingFetch = null;
let allData = null; // last-loaded data for every board — powers cross-board search

async function getAllRankingsData(useFresh = false) {
  if (useFresh) {
    // Refresh click: reuse the background fetch started on page open —
    // already resolved (instant) or still in flight (await it).
    return (allData = await startBackgroundFetch());
  }
  const cached = readCache();
  if (cached) return (allData = cached.data);
  return (allData = await startBackgroundFetch());
}

// Each board's overall ranking, reusing the existing normalizers.
const BOARDS = [
  { page: "index.html",      label: "First Serve", rows: (d) => normalizeFlexibleOverallRankings(d.firstServeRanking || []) },
  { page: "breakpoint.html", label: "Break Point", rows: (d) => normalizeOverallRankings(d.breakPointOverall || []) },
  { page: "matchpoint.html", label: "Match Point", rows: (d) => normalizeMatchPointRankings(d.matchPointPlayers || []) },
  { page: "noida.html",      label: "Noida",       rows: (d) => normalizeNoidaRankings(d.noida || []) }
];

// Show matches from OTHER boards as tappable options below the list;
// clicking opens that board with the player pre-searched.
function renderCrossBoard(query) {
  const sub = document.querySelector(".subsection:not(.panel-hidden)");
  if (!sub || !config) return;
  let box = sub.querySelector(".cross-board");
  const here = config.selectorValue;
  const results = [];
  if (query.length >= 2 && allData) {
    for (const b of BOARDS) {
      if (b.page === here) continue;
      for (const p of qualifyByMatches(b.rows(allData))) {
        if (p.name.toLowerCase().includes(query)) results.push({ p, page: b.page, label: b.label });
      }
    }
  }
  if (!results.length) { box?.remove(); return; }
  if (!box) { box = document.createElement("div"); box.className = "cross-board"; sub.appendChild(box); }
  box.innerHTML = `<p class="cross-board-title">On other boards</p>` +
    results.slice(0, 10).map((r) =>
      `<a class="cross-row" href="${r.page}?q=${encodeURIComponent(query)}">
        ${playerCell(r.p, null, r.p.matches != null ? `${r.p.matches} matches` : "")}
        <span class="cross-board-tag">${r.label} →</span>
      </a>`).join("");
}

// Landing here from a cross-board jump (?q=name): pre-fill the search and filter.
async function applyDeepLinkSearch() {
  const q = new URLSearchParams(location.search).get("q");
  if (!q) return;
  const input = document.querySelector(".subsection:not(.panel-hidden) .leaderboard-search-input");
  if (!input) return;
  input.value = q;
  tableSearchState.set(input.dataset.searchTarget, q.trim().toLowerCase());
  await config?.loader(false);
}

// One "i" button by the standings header explaining rank / rating / score.
function injectInfoButton() {
  const head = document.querySelector(".standings-head > div");
  if (!head || head.querySelector(".info")) return;
  const el = document.createElement("details");
  el.className = "info";
  el.innerHTML = `
    <summary class="info-btn" title="What do these mean?">i</summary>
    <div class="info-pop">
      <p><b>Rank</b> — your spot on the board, set by rating (score breaks ties).</p>
      <p><b>Rating</b> — your level on the 0–7 skill scale.</p>
      <p><b>Score</b> — total match points, which feed your rating.</p>
      <a href="explainer.html">Full guide →</a>
    </div>`;
  head.appendChild(el);
  document.addEventListener("click", (e) => { if (!el.contains(e.target)) el.open = false; });
}

function startBackgroundFetch() {
  if (!pendingFetch) {
    pendingFetch = fetchAllRankingsData()
      .then((data) => {
        writeCache(data);
        return data;
      })
      .catch((error) => {
        pendingFetch = null;
        throw error;
      });
  }
  return pendingFetch;
}

function revalidateInBackground() {
  // If the initial load had no cache it already fetched live data — skip.
  if (pendingFetch) return;
  startBackgroundFetch().catch(() => {});
}

async function fetchAllRankingsData() {
  // { firstServe, breakPoint, matchPoint, noida } — each the raw JSON
  // its endpoint returns, whether it came from Supabase or Apps Script.
  const raw = await fetchRawSources();

  return {
    firstServe:           raw.firstServe.firstServe || [],
    firstServePersonal:   raw.firstServe.pmMatchScores || [],
    firstServeRanking:    pickFirstServeRankingRows(raw.firstServe),
    firstServeTournament: raw.firstServe.tournamentScores || [],
    breakPointOverall:    raw.breakPoint.breakPointOverall || [],
    breakPointTournament: raw.breakPoint.breakPointTournament || [],
    breakPointAmericano:  raw.breakPoint.breakPointAmericano || [],
    matchPointPlayers:    raw.matchPoint.players || [],
    noida:                Array.isArray(raw.noida.data) ? raw.noida.data : []
  };
}

// Fast path (Supabase) with automatic fallback to the Apps Script
// endpoints, so a Supabase outage never takes the board down.
async function fetchRawSources() {
  if (SUPABASE_READY) {
    try {
      return await fetchFromSupabase();
    } catch (error) {
      console.warn("Supabase read failed, falling back to Apps Script:", error);
    }
  }
  return fetchFromAppsScript();
}

async function fetchFromSupabase() {
  const res = await fetch(
    `${SUPABASE.url}/rest/v1/leaderboard_cache?select=source,payload`,
    { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` } }
  );
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  const rows = await res.json();
  const bySource = {};
  for (const row of rows) bySource[row.source] = row.payload;
  for (const key of ["firstServe", "breakPoint", "matchPoint", "noida"]) {
    if (!bySource[key]) throw new Error(`Missing "${key}" in Supabase cache`);
  }
  return bySource;
}

async function fetchFromAppsScript() {
  const [firstServeRes, breakPointRes, matchPointRes, noidaRes] = await Promise.all([
    fetch(API_URLS.firstServe),
    fetch(API_URLS.breakPoint),
    fetch(API_URLS.matchPoint),
    fetch(API_URLS.noida)
  ]);

  if (!firstServeRes.ok) throw new Error("Failed to fetch First Serve data");
  if (!breakPointRes.ok) throw new Error("Failed to fetch Break Point data");
  if (!matchPointRes.ok) throw new Error("Failed to fetch Match Point data");
  if (!noidaRes.ok) throw new Error("Failed to fetch Noida data");

  const [firstServe, breakPoint, matchPoint, noida] = await Promise.all([
    firstServeRes.json(),
    breakPointRes.json(),
    matchPointRes.json(),
    noidaRes.json()
  ]);

  return { firstServe, breakPoint, matchPoint, noida };
}

// ─── CACHE ───────────────────────────────────────────────────────────────────

function readCache() {
  try {
    const raw = window.localStorage.getItem(MASTER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || !parsed?.data || parsed.version !== CACHE_SCHEMA_VERSION) {
      window.localStorage.removeItem(MASTER_CACHE_KEY);
      return null;
    }
    if (Date.now() - parsed.savedAt > CACHE_TTL) {
      window.localStorage.removeItem(MASTER_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("Failed to read cached rankings:", error);
    return null;
  }
}

function writeCache(data) {
  try {
    window.localStorage.setItem(
      MASTER_CACHE_KEY,
      JSON.stringify({ version: CACHE_SCHEMA_VERSION, savedAt: Date.now(), data })
    );
  } catch (error) {
    console.error("Failed to cache rankings:", error);
  }
}

// ─── NORMALIZERS ─────────────────────────────────────────────────────────────

function normalizeBasicRankings(rows) {
  return rows
    .map((row) => ({
      id:      String(row["Player ID"] || "").trim(),
      name:    String(row["Player Name"] || "").trim(),
      matches: toNumber(row.MP),
      score:   toNumber(row.Score),
      rank:    toNumber(row.Ranking || row.ranking || row.Rank || row.rank)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => a.rank - b.rank);
}

function normalizeAmericanoRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id:      String(row["Player ID"] || row.playerId || "").trim(),
      name:    String(row["Player Name"] || row.playerName || row.Name || row.name || "").trim(),
      matches: toNumber(row.MP || row.mp),
      score:   toNumber(row.Score || row.score)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => compareByScore(a, b));
  return addClusterRanks(sorted);
}

function normalizeTournamentRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id:      String(row["Player ID"] || "").trim(),
      name:    String(row["Player Name"] || "").trim(),
      matches: toNumber(row.MP),
      wins:    toNumber(row.won),
      losses:  toNumber(row.Loss),
      score:   toNumber(row.Score)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.wins  !== a.wins)  return b.wins  - a.wins;
      if (b.matches !== a.matches) return b.matches - a.matches;
      return a.name.localeCompare(b.name);
    });
  return addClusterRanks(sorted);
}

function isVerified(row) {
  const v = row.Verified ?? row.verified ?? row.VERIFIED;
  return String(v).trim().toUpperCase() === "TRUE";
}

function normalizeOverallRankings(rows) {
  return rows
    .map((row) => ({
      id:     String(row.ID || "").trim(),
      name:   String(row.Name || "").trim(),
      score:  toNumber(row.Score),
      rating: toDecimal(row.Rating),
      rank:   toNumber(row.Ranking || row.ranking || row.Rank),
      matches: toNumber(row["Matches played"] ?? row.matches ?? row.MP),
      verified: isVerified(row)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => a.rank - b.rank);
}

function normalizeMatchPointRankings(rows) {
  return rows
    .map((row) => ({
      id:     String(row.id || "").trim(),
      name:   String(row.name || "").trim(),
      score:  toNumber(row.score),
      rating: toDecimal(row.rating),
      rank:   toNumber(row.Ranking || row.ranking || row.Rank),
      matches: toNumber(row.matches ?? row["Matches played"] ?? row.MP ?? row.mp),
      verified: isVerified(row)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => a.rank - b.rank);
}

function normalizeFlexibleOverallRankings(rows) {
  return rows
    .map((row) => ({
      id:     String(row.ID || row["Player ID"] || row.playerId || "").trim(),
      name:   String(row.Name || row["Player Name"] || row.playerName || "").trim(),
      score:  toNumber(row.Score || row.score),
      rating: toDecimal(row.Rating ?? row.rating ?? 0),
      rank:   toNumber(row.Ranking || row.ranking || row.Rank),
      matches: toNumber(row["Matches played"] ?? row.matches ?? row.MP ?? row.mp),
      verified: isVerified(row)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => a.rank - b.rank);
}

function normalizeNoidaRankings(rows) {
  return rows
    .map((row) => ({
      id:      String(row.playerId || row.ID || "").trim(),
      name:    String(row.playerName || row.Name || "").trim(),
      matches: toNumber(row.mp ?? row.MP ?? row["Matches played"] ?? row.matches),
      score:   toNumber(row.score ?? row.Score),
      rating:  toDecimal(row.rating ?? row.Rating),
      rank:    toNumber(row.ranking ?? row.Ranking ?? row.rank ?? row.Rank),
      verified: isVerified(row)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => (a.rank && b.rank) ? a.rank - b.rank : compareByScore(a, b));
}

function addClusterRanks(players) {
  let lastScore = null;
  let lastRank  = 0;
  return players.map((player, index) => {
    const rank = player.score === lastScore ? lastRank : index + 1;
    lastScore  = player.score;
    lastRank   = rank;
    return { ...player, rank };
  });
}

function compareByScore(a, b) {
  if (b.score   !== a.score)   return b.score   - a.score;
  if (b.matches !== a.matches) return b.matches  - a.matches;
  return a.name.localeCompare(b.name);
}

// Leaderboard only ranks players with at least MIN_MATCHES games played.
// Drops everyone below the threshold, then renumbers ranks 1..N on the
// qualifying set (assumes the input is already sorted by standing).
const MIN_MATCHES = 2;
function qualifyByMatches(players, min = MIN_MATCHES) {
  return players
    .filter((p) => (Number(p.matches) || 0) >= min)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

// ─── RENDERERS ───────────────────────────────────────────────────────────────

function getViewerName() {
  try {
    if (sessionStorage.getItem("dpcDemo") === "1") return "Nik S";
    const raw = localStorage.getItem("dpcPlayerSession");
    if (raw) { const p = JSON.parse(raw); return p ? (p.boardName || p.name || null) : null; }
  } catch (e) {}
  return null;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isViewer(player, viewer) {
  return !!(viewer && player.name && player.name.toLowerCase() === viewer.toLowerCase());
}

const AV_COLORS = ["#9d7bc9","#5b6472","#2f8f83","#c1614f","#3f9d7f","#7c6fc9","#b1793f","#4f7cc1","#a85a86","#3d8f8f"];
function avColor(name) {
  let h = 0; const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function verifiedBadge(p) {
  return p && p.verified ? '<span class="vbadge" title="Verified ranking">✓</span>' : "";
}
function ensureVerifiedLegend(target, anyVerified) {
  const sub = target.closest(".subsection"); if (!sub) return;
  let leg = sub.querySelector(".verified-legend");
  if (anyVerified && !leg) {
    leg = document.createElement("div");
    leg.className = "verified-legend";
    leg.innerHTML = '<span class="vbadge">✓</span> Verified ranking';
    const podium = sub.querySelector(".podium");
    if (podium) podium.after(leg); else sub.prepend(leg);
  } else if (!anyVerified && leg) { leg.remove(); }
}

function podiumMarkup(top3, opts) {
  const order = [top3[1], top3[0], top3[2]];
  const slot  = ["second", "first", "third"];
  const label = { first: "1st", second: "2nd", third: "3rd" };
  return order.map((p, i) => {
    const s = slot[i];
    if (!p) return `<div class="podium-item ${s}"><div class="podium-block">${label[s]}</div></div>`;
    return `<div class="podium-item ${s}">
      <div class="podium-avwrap">
        <div class="podium-avatar" style="background:${avColor(p.name)}">${escapeHtml(initials(p.name))}</div>
        <div class="podium-badge">${p.rank}</div>
      </div>
      <div class="podium-name"><span>${escapeHtml(p.name)}</span>${verifiedBadge(p)}</div>
      <div class="podium-value">${opts.value(p)}</div>
      ${opts.podSub ? `<div class="podium-score">${escapeHtml(String(opts.podSub(p)))}</div>` : ""}
      <div class="podium-block">${label[s]}</div>
    </div>`;
  }).join("");
}

function yourRankMarkup(me, opts) {
  return `<div class="your-rank-num">${me.rank}</div>
    <div class="your-rank-mid">
      <div class="your-rank-kicker">Your rank</div>
      <div class="your-rank-name">${escapeHtml(me.name)}</div>
    </div>
    <div class="your-rank-val">${opts.value(me)}</div>`;
}

// Inject/update the podium + "your rank" card for a panel, and return the
// list of players the table below should show (ranks 4+ when the podium is
// visible; the full list while searching).
function enhancePanel(target, rankings, opts) {
  const subsection = target.closest(".subsection");
  if (!subsection) return rankings;
  const query  = tableSearchState.get(target.id) || "";
  const search = subsection.querySelector(".leaderboard-search");

  let podium = subsection.querySelector(".podium");
  if (!podium) {
    podium = document.createElement("div");
    podium.className = "podium";
    subsection.insertBefore(podium, search || subsection.querySelector(".table-wrap"));
  }
  let yr = subsection.querySelector(".your-rank");
  if (!yr) {
    yr = document.createElement("div");
    yr.className = "your-rank";
  }
  podium.after(yr); // keep "your rank" pinned to the top, under the podium

  if (query || rankings.length < 3) {
    podium.hidden = true;
    yr.hidden = true;
    return rankings;
  }

  podium.hidden = false;
  podium.innerHTML = podiumMarkup(rankings.slice(0, 3), opts);

  const viewer = getViewerName();
  const me = viewer ? rankings.find((p) => isViewer(p, viewer)) : null;
  if (me) { yr.hidden = false; yr.innerHTML = yourRankMarkup(me, opts); }
  else { yr.hidden = true; }

  return rankings.slice(3);
}

function playerCell(player, viewer, sub) {
  const subhtml = sub ? `<div class="player-sub">${escapeHtml(sub)}</div>` : "";
  return `<div class="player-cell">
    <span class="avatar" style="background:${avColor(player.name)}">${escapeHtml(initials(player.name))}</span>
    <span class="player-info"><span class="nmrow"><span class="player-name">${escapeHtml(player.name)}</span>${verifiedBadge(player)}</span>${subhtml}</span>
  </div>`;
}

function renderBasicTable(target, rankings, colspan, emptyMessage = "No ranking entries yet.") {
  if (!target) return;
  ensureSearchUi(target);
  if (!rankings.length) { renderMessageRow(target, emptyMessage, colspan); return; }
  const viewer = getViewerName();
  const listRankings = enhancePanel(target, rankings, {
    value: (p) => p.score,
    label: "Points",
    sub: (p) => (p.matches != null ? `${p.matches} matches` : "")
  });
  const visibleRankings = getVisibleRankings(target, listRankings);
  if (!visibleRankings.length) { renderMessageRow(target, "No players found for that search.", colspan); return; }
  target.innerHTML = visibleRankings.map((player) => {
    const badge = renderBadge(player.rank);
    return `
      <tr class="${isViewer(player, viewer) ? "highlight" : ""}">
        <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
        <td>${playerCell(player, viewer)}</td>
        <td class="stat-cell">${player.matches}</td>
        <td class="stat-cell points-cell">${player.score}</td>
      </tr>`;
  }).join("");
}

function renderTournamentTable(target, rankings, colspan, emptyMessage = "No tournament entries yet.") {
  if (!target) return;
  ensureSearchUi(target);
  if (!rankings.length) { renderMessageRow(target, emptyMessage, colspan); return; }
  const viewer = getViewerName();
  const listRankings = enhancePanel(target, rankings, {
    value: (p) => p.score,
    label: "Points",
    sub: (p) => `${p.wins || 0}W · ${p.losses || 0}L`
  });
  const visibleRankings = getVisibleRankings(target, listRankings);
  if (!visibleRankings.length) { renderMessageRow(target, "No players found for that search.", colspan); return; }
  target.innerHTML = visibleRankings.map((player) => {
    const badge = renderBadge(player.rank);
    return `
      <tr class="${isViewer(player, viewer) ? "highlight" : ""}">
        <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
        <td>${playerCell(player, viewer)}</td>
        <td class="stat-cell">${player.matches}</td>
        <td class="stat-cell">${player.wins}</td>
        <td class="stat-cell">${player.losses}</td>
        <td class="stat-cell points-cell">${player.score}</td>
      </tr>`;
  }).join("");
}

function renderOverallTable(target, rankings, colspan) {
  if (!target) return;
  ensureSearchUi(target);
  rankings = qualifyByMatches(rankings); // ranking only counts players with >=2 matches
  if (!rankings.length) { renderMessageRow(target, "No overall entries yet.", colspan); return; }
  const viewer = getViewerName();
  const listRankings = enhancePanel(target, rankings, {
    value: (p) => p.rating.toFixed(1),
    label: "Rating",
    sub: (p) => [p.matches != null ? `${p.matches} matches` : "", `${p.score} score`].filter(Boolean).join(" · ")
  });
  ensureVerifiedLegend(target, rankings.some((p) => p.verified));
  const visibleRankings = getVisibleRankings(target, listRankings);
  if (!visibleRankings.length) { renderMessageRow(target, "No players found for that search.", colspan); return; }
  target.innerHTML = visibleRankings.map((player) => {
    const badge = renderBadge(player.rank);
    const sub = player.matches != null ? `${player.matches} matches` : "";
    return `
      <tr class="${isViewer(player, viewer) ? "highlight" : ""}">
        <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
        <td>${playerCell(player, viewer, sub)}</td>
        <td class="stat-cell">${player.score}</td>
        <td class="stat-cell points-cell">${player.rating.toFixed(1)}</td>
      </tr>`;
  }).join("");
}

function renderMessageRow(target, message, colspan) {
  if (!target) return;
  target.innerHTML = `<tr><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
}

function renderBadge(rank) {
  if (rank === 1) return { className: "badge first",  label: "1" };
  if (rank === 2) return { className: "badge second", label: "2" };
  if (rank === 3) return { className: "badge third",  label: "3" };
  return null;
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────

function ensureSearchUi(target) {
  if (!target?.id) return;
  const tableWrap = target.closest(".table-wrap");
  if (!tableWrap || tableWrap.previousElementSibling?.classList.contains("leaderboard-search")) return;
  tableWrap.insertAdjacentHTML("beforebegin", `
    <div class="leaderboard-search">
      <input
        class="leaderboard-search-input"
        type="text"
        placeholder="Search player name"
        aria-label="Search player name"
        data-search-target="${target.id}"
      />
      <button class="search-clear" type="button" aria-label="Clear search" hidden>×</button>
    </div>
  `);
  const wrap = tableWrap.previousElementSibling;
  const input = wrap?.querySelector(".leaderboard-search-input");
  const clearBtn = wrap?.querySelector(".search-clear");
  if (!input) return;
  const applyQuery = (raw) => {
    const q = raw.trim().toLowerCase();
    if (clearBtn) clearBtn.hidden = !raw;
    tableSearchState.set(target.id, q);
    config?.loader(false);
    renderCrossBoard(q);
  };
  input.addEventListener("input", (event) => applyQuery(event.target.value));
  clearBtn?.addEventListener("click", () => { input.value = ""; applyQuery(""); input.focus(); });
}

function getVisibleRankings(target, rankings) {
  const query = tableSearchState.get(target.id) || "";
  if (!query) return rankings.slice(0, DEFAULT_VISIBLE_RANKINGS);
  return rankings.filter((player) => player.name.toLowerCase().includes(query));
}

// ─── STATUS & LOADING ────────────────────────────────────────────────────────

function updateStatus(message, isError = false) {
  if (!elements.statusMessage) return;
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("is-error", isError);
}

function setLoadingState(isLoading) {
  if (!elements.refreshButton || !config) return;
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.classList.toggle("spinning", isLoading);
}

// ─── TAB INIT ────────────────────────────────────────────────────────────────

function initFirstServeTabs() {
  if (page !== "first-serve") return;
  if (!elements.firstServeRankingTab) return;
  elements.firstServeRankingTab.addEventListener("click",    () => setFirstServeTab("ranking"));
  elements.firstServeOverallTab.addEventListener("click",    () => setFirstServeTab("overall"));
  elements.firstServePersonalTab.addEventListener("click",   () => setFirstServeTab("personal"));
  elements.firstServeTournamentTab?.addEventListener("click", () => setFirstServeTab("tournament"));
  setFirstServeTab("ranking");
}

function initBreakPointTabs() {
  if (page !== "break-point" && page !== "match-point") return;
  if (!elements.overallTab || !elements.tournamentTab || !elements.americanoTab) return;
  elements.overallTab.addEventListener("click",    () => setBreakPointTab("overall"));
  elements.tournamentTab.addEventListener("click", () => setBreakPointTab("tournament"));
  elements.americanoTab.addEventListener("click",  () => setBreakPointTab("americano"));
  setBreakPointTab("overall");
}

// ─── TAB SWITCHERS ───────────────────────────────────────────────────────────

function setFirstServeTab(tabName) {
  const tabs = {
    ranking:    { tab: elements.firstServeRankingTab,    panel: elements.firstServeRankingPanel },
    overall:    { tab: elements.firstServeOverallTab,    panel: elements.firstServeOverallPanel },
    personal:   { tab: elements.firstServePersonalTab,   panel: elements.firstServePersonalPanel },
    tournament: { tab: elements.firstServeTournamentTab, panel: elements.firstServeTournamentPanel }
  };
  Object.entries(tabs).forEach(([key, { tab, panel }]) => {
    if (!tab || !panel) return;
    const isActive = key === tabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    panel.hidden = !isActive;
    panel.classList.toggle("panel-hidden", !isActive);
  });
}

function setBreakPointTab(tabName) {
  if (
    !elements.overallTab || !elements.tournamentTab || !elements.americanoTab ||
    !elements.overallPanel || !elements.tournamentPanel || !elements.americanoPanel
  ) return;
  const isOverall    = tabName === "overall";
  const isTournament = tabName === "tournament";
  const isAmericano  = tabName === "americano";
  elements.overallTab.classList.toggle("is-active", isOverall);
  elements.tournamentTab.classList.toggle("is-active", isTournament);
  elements.americanoTab.classList.toggle("is-active", isAmericano);
  elements.overallTab.setAttribute("aria-selected", String(isOverall));
  elements.tournamentTab.setAttribute("aria-selected", String(isTournament));
  elements.americanoTab.setAttribute("aria-selected", String(isAmericano));
  elements.overallPanel.hidden    = !isOverall;
  elements.tournamentPanel.hidden = !isTournament;
  elements.americanoPanel.hidden  = !isAmericano;
  elements.overallPanel.classList.toggle("panel-hidden", !isOverall);
  elements.tournamentPanel.classList.toggle("panel-hidden", !isTournament);
  elements.americanoPanel.classList.toggle("panel-hidden", !isAmericano);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function toNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDecimal(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pickFirstServeRankingRows(firstServeData) {
  const preferredKeys = ["overallRanking","overallRankings","ranking","rankings","finalScore","finalScores","scoreRating","scoreRatings"];
  for (const key of preferredKeys) {
    if (Array.isArray(firstServeData[key])) return firstServeData[key];
  }
  for (const [key, value] of Object.entries(firstServeData)) {
    if (!Array.isArray(value) || key === "firstServe" || key === "pmMatchScores" || key === "tournamentScores") continue;
    const firstRow = value.find((row) => row && typeof row === "object");
    if (!firstRow) continue;
    const hasRating = "Rating" in firstRow || "rating" in firstRow;
    const hasScore  = "Score"  in firstRow || "score"  in firstRow;
    const hasName   = "Name"   in firstRow || "Player Name" in firstRow || "playerName" in firstRow;
    if (hasRating && hasScore && hasName) return value;
  }
  return [];
}
