const CACHE_TTL = 1 * 60 * 60 * 1000;
const MASTER_CACHE_KEY = "dpcRankingCache:all-pages";
const CACHE_SCHEMA_VERSION = 5;
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
    selectorValue: "break-point.html",
    refreshText: "Refresh All",
    loader: loadBreakPointPage
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
  noida: "https://script.google.com/macros/s/AKfycbyum4imblCdj5mFLbr-zDFthSM8Am0f-1DrEVgdF7jioZueooMguFDgy5GX7V_3yRNH/exec"
};

const page = document.body.dataset.page;
const config = PAGE_CONFIG[page];

const elements = {
  statusMessage: document.getElementById("statusMessage"),
  refreshButton: document.getElementById("refreshButton"),
  pageSelector: document.getElementById("pageSelector"),
  rankingBody: document.getElementById("rankingBody"),
  firstServeRankingBody: document.getElementById("firstServeRankingBody"),
  personalRankingBody: document.getElementById("personalRankingBody"),
  overallRankingBody: document.getElementById("overallRankingBody"),
  tournamentRankingBody: document.getElementById("tournamentRankingBody"),
  americanoRankingBody: document.getElementById("americanoRankingBody"),
  firstServeRankingTab: document.getElementById("firstServeRankingTab"),
  firstServeOverallTab: document.getElementById("firstServeOverallTab"),
  firstServePersonalTab: document.getElementById("firstServePersonalTab"),
  firstServeRankingPanel: document.getElementById("firstServeRankingPanel"),
  firstServeOverallPanel: document.getElementById("firstServeOverallPanel"),
  firstServePersonalPanel: document.getElementById("firstServePersonalPanel"),
  overallTab: document.getElementById("overallTab"),
  tournamentTab: document.getElementById("tournamentTab"),
  americanoTab: document.getElementById("americanoTab"),
  overallPanel: document.getElementById("overallPanel"),
  tournamentPanel: document.getElementById("tournamentPanel"),
  americanoPanel: document.getElementById("americanoPanel")
};

document.addEventListener("DOMContentLoaded", () => {
  initPageSelector();
  initAdminMode();
  initFirstServeTabs();
  initBreakPointTabs();

  elements.refreshButton?.addEventListener("click", () => config?.loader(true));
  config?.loader(false);
});

function initPageSelector() {
  if (!elements.pageSelector || !config) {
    return;
  }

  elements.pageSelector.value = config.selectorValue;
  elements.pageSelector.addEventListener("change", (event) => {
    window.location.href = event.target.value;
  });
}

function initAdminMode() {
  if (!elements.refreshButton || !config) {
    return;
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get(ADMIN_QUERY_KEY) === ADMIN_QUERY_VALUE) {
    window.localStorage.setItem(ADMIN_STORAGE_KEY, "true");
  }

  const isAdmin = window.localStorage.getItem(ADMIN_STORAGE_KEY) === "true";
  elements.refreshButton.hidden = !isAdmin;
  elements.refreshButton.textContent = config.refreshText;
}

async function loadFirstServePage(isManualRefresh) {
  setLoadingState(true);
  updateStatus(isManualRefresh ? "Refreshing leaderboard..." : "");

  try {
    const data = await getAllRankingsData(isManualRefresh);
    const overallRankings = normalizeFlexibleOverallRankings(data.firstServeRanking);
    const rankings = normalizeBasicRankings(data.firstServe);
    const personalGamesRankings = normalizeBasicRankings(data.firstServePersonal);

    if (!overallRankings.length && !rankings.length && !personalGamesRankings.length) {
      throw new Error("No ranking entries were found.");
    }

    renderOverallTable(elements.firstServeRankingBody, overallRankings, 4);
    renderBasicTable(elements.rankingBody, rankings, 4);
    renderBasicTable(elements.personalRankingBody, personalGamesRankings, 4, "No personal matches entries yet.");
    updateStatus("");
  } catch (error) {
    console.error("Failed to load First Serve rankings:", error);
    renderMessageRow(elements.firstServeRankingBody, "Ranking data is not available right now.", 4);
    renderMessageRow(elements.rankingBody, "Leaderboard data is not available right now.", 4);
    renderMessageRow(elements.personalRankingBody, "Personal matches leaderboard is not available right now.", 4);
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
    const overallRankings = normalizeOverallRankings(data.breakPointOverall);
    const tournamentRankings = normalizeTournamentRankings(data.breakPointTournament);
    const americanoRankings = normalizeBasicRankings(data.breakPointAmericano);

    if (!overallRankings.length && !tournamentRankings.length && !americanoRankings.length) {
      throw new Error("No Break Point rankings were found.");
    }

    renderOverallTable(elements.overallRankingBody, overallRankings, 4);
    renderTournamentTable(elements.tournamentRankingBody, tournamentRankings, 6);
    renderBasicTable(elements.americanoRankingBody, americanoRankings, 4);
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

async function loadNoidaPage(isManualRefresh) {
  setLoadingState(true);
  updateStatus(isManualRefresh ? "Refreshing leaderboard..." : "");

  try {
    const data = await getAllRankingsData(isManualRefresh);
    const rankings = normalizeNoidaRankings(data.noida);

    if (!rankings.length) {
      throw new Error("No Noida ranking entries were found.");
    }

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

async function getAllRankingsData(forceRefresh = false) {
  const cached = readCache();

  //h
  if (!forceRefresh && cached) {
    return cached.data;
  }

  
  const data = await fetchAllRankingsData();
  writeCache(data);
  return data;
}

async function fetchAllRankingsData() {
  const firstServe = await fetchJson(API_URLS.firstServe);

  const breakPointResponse = await fetch(API_URLS.breakPoint);
  if (!breakPointResponse.ok) {
    throw new Error("Failed to fetch Break Point data");
  }
  const breakPointData = await breakPointResponse.json();

  const noidaResponse = await fetch(API_URLS.noida);
  if (!noidaResponse.ok) {
    throw new Error("Failed to fetch Noida data");
  }
  const noidaData = await noidaResponse.json();

  return {
    firstServe: firstServe.firstServe || [],
    firstServePersonal: firstServe.pmMatchScores || [],
    firstServeRanking: pickFirstServeRankingRows(firstServe),
    breakPointOverall: breakPointData.breakPointOverall || [],
    breakPointTournament: breakPointData.breakPointTournament || [],
    breakPointAmericano: breakPointData.breakPointAmericano || [],
    noida: Array.isArray(noidaData.data) ? noidaData.data : []
  };
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function readCache() {
  try {
    const raw = window.localStorage.getItem(MASTER_CACHE_KEY);

    if (!raw) {
      return null;
    }

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
      JSON.stringify({
        version: CACHE_SCHEMA_VERSION,
        savedAt: Date.now(),
        data
      })
    );
  } catch (error) {
    console.error("Failed to cache rankings:", error);
  }
}

function normalizeBasicRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id: String(row["Player ID"] || "").trim(),
      name: String(row["Player Name"] || "").trim(),
      matches: toNumber(row.MP),
      score: toNumber(row.Score)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((left, right) => compareByScore(left, right));

  return addClusterRanks(sorted);
}

function normalizeTournamentRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id: String(row["Player ID"] || "").trim(),
      name: String(row["Player Name"] || "").trim(),
      matches: toNumber(row.MP),
      wins: toNumber(row.won),
      losses: toNumber(row.Loss),
      score: toNumber(row.Score)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (right.wins !== left.wins) {
        return right.wins - left.wins;
      }

      if (right.matches !== left.matches) {
        return right.matches - left.matches;
      }

      return left.name.localeCompare(right.name);
    });

  return addClusterRanks(sorted);
}

function normalizeOverallRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id: String(row.ID || "").trim(),
      name: String(row.Name || "").trim(),
      score: toNumber(row.Score),
      rating: toDecimal(row.Rating)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((left, right) => {
      if (right.rating !== left.rating) {
        return right.rating - left.rating;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    });

  let lastRating = null;
  let lastRank = 0;

  return sorted.map((player, index) => {
    const rank = player.rating === lastRating ? lastRank : index + 1;
    lastRating = player.rating;
    lastRank = rank;

    return {
      ...player,
      rank
    };
  });
}

function normalizeFlexibleOverallRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id: String(row.ID || row["Player ID"] || row.playerId || "").trim(),
      name: String(row.Name || row["Player Name"] || row.playerName || "").trim(),
      score: toNumber(row.Score || row.score),
      rating: toDecimal(row.Rating || row.rating)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((left, right) => {
      if (right.rating !== left.rating) {
        return right.rating - left.rating;
      }

      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.name.localeCompare(right.name);
    });

  let lastRating = null;
  let lastRank = 0;

  return sorted.map((player, index) => {
    const rank = player.rating === lastRating ? lastRank : index + 1;
    lastRating = player.rating;
    lastRank = rank;

    return {
      ...player,
      rank
    };
  });
}

function normalizeNoidaRankings(rows) {
  const sorted = rows
    .map((row) => ({
      id: String(row.playerId || "").trim(),
      name: String(row.playerName || "").trim(),
      matches: toNumber(row.mp),
      score: toNumber(row.score)
    }))
    .filter((player) => player.name && !player.name.startsWith("#"))
    .sort((left, right) => compareByScore(left, right));

  return addClusterRanks(sorted);
}

function addClusterRanks(players) {
  let lastScore = null;
  let lastRank = 0;

  return players.map((player, index) => {
    const rank = player.score === lastScore ? lastRank : index + 1;
    lastScore = player.score;
    lastRank = rank;

    return {
      ...player,
      rank
    };
  });
}

function compareByScore(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.matches !== left.matches) {
    return right.matches - left.matches;
  }

  return left.name.localeCompare(right.name);
}

function renderBasicTable(target, rankings, colspan, emptyMessage = "No ranking entries yet.") {
  if (!target) {
    return;
  }

  if (!rankings.length) {
    renderMessageRow(target, emptyMessage, colspan);
    return;
  }

  target.innerHTML = rankings
    .map((player, index) => {
      const badge = renderBadge(player.rank);

      return `
        <tr class="${index === 0 ? "highlight" : ""}">
          <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
          <td><div class="player-name">${escapeHtml(player.name)}</div></td>
          <td class="stat-cell">${player.matches}</td>
          <td class="stat-cell points-cell">${player.score}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTournamentTable(target, rankings, colspan) {
  if (!target) {
    return;
  }

  if (!rankings.length) {
    renderMessageRow(target, "No tournament entries yet.", colspan);
    return;
  }

  target.innerHTML = rankings
    .map((player, index) => {
      const badge = renderBadge(player.rank);

      return `
        <tr class="${index === 0 ? "highlight" : ""}">
          <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
          <td><div class="player-name">${escapeHtml(player.name)}</div></td>
          <td class="stat-cell">${player.matches}</td>
          <td class="stat-cell">${player.wins}</td>
          <td class="stat-cell">${player.losses}</td>
          <td class="stat-cell points-cell">${player.score}</td>
        </tr>
      `;
    })
    .join("");
}

function renderOverallTable(target, rankings, colspan) {
  if (!target) {
    return;
  }

  if (!rankings.length) {
    renderMessageRow(target, "No overall entries yet.", colspan);
    return;
  }

  target.innerHTML = rankings
    .map((player, index) => {
      const badge = renderBadge(player.rank);

      return `
        <tr class="${index === 0 ? "highlight" : ""}">
          <td>${badge ? `<span class="${badge.className}">${badge.label}</span>` : `<span class="rank-text">${player.rank}</span>`}</td>
          <td><div class="player-name">${escapeHtml(player.name)}</div></td>
          <td class="stat-cell">${player.score}</td>
          <td class="stat-cell points-cell">${player.rating.toFixed(1)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderMessageRow(target, message, colspan) {
  if (!target) {
    return;
  }

  target.innerHTML = `
    <tr>
      <td colspan="${colspan}">${escapeHtml(message)}</td>
    </tr>
  `;
}

function renderBadge(rank) {
  if (rank === 1) {
    return { className: "badge first", label: "1" };
  }

  if (rank === 2) {
    return { className: "badge second", label: "2" };
  }

  if (rank === 3) {
    return { className: "badge third", label: "3" };
  }

  return null;
}

function updateStatus(message, isError = false) {
  if (!elements.statusMessage) {
    return;
  }

  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("is-error", isError);
}

function setLoadingState(isLoading) {
  if (!elements.refreshButton || !config) {
    return;
  }

  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? "Refreshing" : config.refreshText;
}

function initBreakPointTabs() {
  if (page !== "break-point" || !elements.overallTab || !elements.tournamentTab || !elements.americanoTab) {
    return;
  }

  elements.overallTab.addEventListener("click", () => setBreakPointTab("overall"));
  elements.tournamentTab.addEventListener("click", () => setBreakPointTab("tournament"));
  elements.americanoTab.addEventListener("click", () => setBreakPointTab("americano"));
  setBreakPointTab("overall");
}

function initFirstServeTabs() {
  if (
    page !== "first-serve" ||
    !elements.firstServeRankingTab ||
    !elements.firstServeOverallTab ||
    !elements.firstServePersonalTab
  ) {
    return;
  }

  elements.firstServeRankingTab.addEventListener("click", () => setFirstServeTab("ranking"));
  elements.firstServeOverallTab.addEventListener("click", () => setFirstServeTab("overall"));
  elements.firstServePersonalTab.addEventListener("click", () => setFirstServeTab("personal"));
  setFirstServeTab("ranking");
}

function setFirstServeTab(tabName) {
  if (
    !elements.firstServeRankingTab ||
    !elements.firstServeOverallTab ||
    !elements.firstServePersonalTab ||
    !elements.firstServeRankingPanel ||
    !elements.firstServeOverallPanel ||
    !elements.firstServePersonalPanel
  ) {
    return;
  }

  const isRanking = tabName === "ranking";
  const isOverall = tabName === "overall";
  const isPersonal = tabName === "personal";

  elements.firstServeRankingTab.classList.toggle("is-active", isRanking);
  elements.firstServeOverallTab.classList.toggle("is-active", isOverall);
  elements.firstServePersonalTab.classList.toggle("is-active", isPersonal);
  elements.firstServeRankingTab.setAttribute("aria-selected", String(isRanking));
  elements.firstServeOverallTab.setAttribute("aria-selected", String(isOverall));
  elements.firstServePersonalTab.setAttribute("aria-selected", String(isPersonal));
  elements.firstServeRankingPanel.hidden = !isRanking;
  elements.firstServeOverallPanel.hidden = !isOverall;
  elements.firstServePersonalPanel.hidden = !isPersonal;
  elements.firstServeRankingPanel.classList.toggle("panel-hidden", !isRanking);
  elements.firstServeOverallPanel.classList.toggle("panel-hidden", !isOverall);
  elements.firstServePersonalPanel.classList.toggle("panel-hidden", !isPersonal);
}

function setBreakPointTab(tabName) {
  if (
    !elements.overallTab ||
    !elements.tournamentTab ||
    !elements.americanoTab ||
    !elements.overallPanel ||
    !elements.tournamentPanel ||
    !elements.americanoPanel
  ) {
    return;
  }

  const isOverall = tabName === "overall";
  const isTournament = tabName === "tournament";
  const isAmericano = tabName === "americano";

  elements.overallTab.classList.toggle("is-active", isOverall);
  elements.tournamentTab.classList.toggle("is-active", isTournament);
  elements.americanoTab.classList.toggle("is-active", isAmericano);
  elements.overallTab.setAttribute("aria-selected", String(isOverall));
  elements.tournamentTab.setAttribute("aria-selected", String(isTournament));
  elements.americanoTab.setAttribute("aria-selected", String(isAmericano));
  elements.overallPanel.hidden = !isOverall;
  elements.tournamentPanel.hidden = !isTournament;
  elements.americanoPanel.hidden = !isAmericano;
  elements.overallPanel.classList.toggle("panel-hidden", !isOverall);
  elements.tournamentPanel.classList.toggle("panel-hidden", !isTournament);
  elements.americanoPanel.classList.toggle("panel-hidden", !isAmericano);
}

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
  const preferredKeys = [
    "overallRanking",
    "overallRankings",
    "ranking",
    "rankings",
    "finalScore",
    "finalScores",
    "scoreRating",
    "scoreRatings"
  ];

  for (const key of preferredKeys) {
    if (Array.isArray(firstServeData[key])) {
      return firstServeData[key];
    }
  }

  for (const [key, value] of Object.entries(firstServeData)) {
    if (!Array.isArray(value) || key === "firstServe" || key === "pmMatchScores") {
      continue;
    }

    const firstRow = value.find((row) => row && typeof row === "object");

    if (!firstRow) {
      continue;
    }

    const hasRating = "Rating" in firstRow || "rating" in firstRow;
    const hasScore = "Score" in firstRow || "score" in firstRow;
    const hasName =
      "Name" in firstRow ||
      "Player Name" in firstRow ||
      "playerName" in firstRow;

    if (hasRating && hasScore && hasName) {
      return value;
    }
  }

  return [];
}
