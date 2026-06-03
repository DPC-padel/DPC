const CACHE_TTL = 1 * 60 * 60 * 1000;
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

const DEFAULT_VISIBLE_RANKINGS = 10;
const tableSearchState = new Map();

document.addEventListener("DOMContentLoaded", () => {
  initPageSelector();
  initAdminMode();
  initFirstServeTabs();
  initBreakPointTabs();
  elements.refreshButton?.addEventListener("click", () => config?.loader(true));
  config?.loader(false);
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
  const isAdmin = window.localStorage.getItem(ADMIN_STORAGE_KEY) === "true";
  elements.refreshButton.hidden = !isAdmin;
  elements.refreshButton.textContent = config.refreshText;
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
    renderBasicTable(elements.rankingBody, rankings, 4);
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

async function getAllRankingsData(forceRefresh = false) {
  const cached = readCache();
  if (!forceRefresh && cached) return cached.data;
  const data = await fetchAllRankingsData();
  writeCache(data);
  return data;
}

async function fetchAllRankingsData() {
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

  const [firstServeData, breakPointData, matchPointData, noidaData] = await Promise.all([
    firstServeRes.json(),
    breakPointRes.json(),
    matchPointRes.json(),
    noidaRes.json()
  ]);

  return {
    firstServe:           firstServeData.firstServe || [],
    firstServePersonal:   firstServeData.pmMatchScores || [],
    firstServeRanking:    pickFirstServeRankingRows(firstServeData),
    firstServeTournament: firstServeData.tournamentScores || [],   // ← NEW
    breakPointOverall:    breakPointData.breakPointOverall || [],
    breakPointTournament: breakPointData.breakPointTournament || [],
    breakPointAmericano:  breakPointData.breakPointAmericano || [],
    matchPointPlayers:    matchPointData.players || [],
    noida:                Array.isArray(noidaData.data) ? noidaData.data : []
  };
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

function normalizeOverallRankings(rows) {
  return rows
    .map((row) => ({
      id:     String(row.ID || "").trim(),
      name:   String(row.Name || "").trim(),
      score:  toNumber(row.Score),
      rating: toDecimal(row.Rating),
      rank:   toNumber(row.Ranking || row.ranking || row.Rank)
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
      rank:   toNumber(row.Ranking || row.ranking || row.Rank)
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
      rank:   toNumber(row.Ranking || row.ranking || row.Rank)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => a.rank - b.rank);
}

function normalizeNoidaRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id:      String(row.playerId || "").trim(),
      name:    String(row.playerName || "").trim(),
      matches: toNumber(row.mp),
      score:   toNumber(row.score)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((a, b) => compareByScore(a, b));
  return addClusterRanks(sorted);
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

// ─── RENDERERS ───────────────────────────────────────────────────────────────

function renderBasicTable(target, rankings, colspan, emptyMessage = "No ranking entries yet.") {
  if (!target) return;
  ensureSearchUi(target);
  if (!rankings.length) { renderMessageRow(target, emptyMessage, colspan); return; }
  const visibleRankings = getVisibleRankings(target, rankings);
  if (!visibleRankings.length) { renderMessageRow(target, "No players found for that search.", colspan); return; }
  target.innerHTML = visibleRankings.map((player, index) => {
    const badge = renderBadge(player.rank);
    return `
      <tr class="${index === 0 ? "highlight" : ""}">
        <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
        <td><div class="player-name">${escapeHtml(player.name)}</div></td>
        <td class="stat-cell">${player.matches}</td>
        <td class="stat-cell points-cell">${player.score}</td>
      </tr>`;
  }).join("");
}

function renderTournamentTable(target, rankings, colspan, emptyMessage = "No tournament entries yet.") {
  if (!target) return;
  ensureSearchUi(target);
  if (!rankings.length) { renderMessageRow(target, emptyMessage, colspan); return; }
  const visibleRankings = getVisibleRankings(target, rankings);
  if (!visibleRankings.length) { renderMessageRow(target, "No players found for that search.", colspan); return; }
  target.innerHTML = visibleRankings.map((player, index) => {
    const badge = renderBadge(player.rank);
    return `
      <tr class="${index === 0 ? "highlight" : ""}">
        <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
        <td><div class="player-name">${escapeHtml(player.name)}</div></td>
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
  if (!rankings.length) { renderMessageRow(target, "No overall entries yet.", colspan); return; }
  const visibleRankings = getVisibleRankings(target, rankings);
  if (!visibleRankings.length) { renderMessageRow(target, "No players found for that search.", colspan); return; }
  target.innerHTML = visibleRankings.map((player, index) => {
    const badge = renderBadge(player.rank);
    return `
      <tr class="${index === 0 ? "highlight" : ""}">
        <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
        <td><div class="player-name">${escapeHtml(player.name)}</div></td>
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
        type="search"
        placeholder="Search player name"
        aria-label="Search player name"
        data-search-target="${target.id}"
      />
      <p class="leaderboard-search-note">Showing top 10 by default. Search any player by name.</p>
    </div>
  `);
  const input = tableWrap.previousElementSibling?.querySelector(".leaderboard-search-input");
  if (!input) return;
  input.addEventListener("input", (event) => {
    tableSearchState.set(target.id, event.target.value.trim().toLowerCase());
    config?.loader(false);
  });
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
  elements.refreshButton.textContent = isLoading ? "Refreshing" : config.refreshText;
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

// ─── PRELOAD ─────────────────────────────────────────────────────────────────

(async function preload() {
  try {
    const cached = readCache();
    if (!cached) {
      const data = await fetchAllRankingsData();
      writeCache(data);
    }
  } catch (e) {
    // silent fail
  }
})();
