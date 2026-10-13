// Ranking tab (Break Point and First Serve boards): ranked by Pts — total
// match points — with each player's rating beside their name and their Pts
// as the main number. It fills the existing Ranking panel in the Girls board's
// layout (podium, then card rows with avatar, matches and the verified tick),
// replacing that panel's rating-ordered table. The podium shows the top 3 by Pts
// and the list continues from #4; while searching, the podium hides and every
// match shows. The other tabs are unchanged.
(function () {
  const BOARD = {
    "first-serve": { source: "firstServe", key: "rankings", panel: "firstServeRankingPanel" },
    "break-point": { source: "breakPoint", key: "breakPointOverall", panel: "overallPanel" },
  }[document.body.dataset.page];
  const panel = BOARD && document.getElementById(BOARD.panel);
  if (!panel) return;
  const SB = { url: "https://zruqzybdpniofxbcwuat.supabase.co", key: "sb_publishable_O5kl7By_s23gMXNULck-yw_cksU-9Oy" };
  const MIN_MATCHES = 2;

  panel.classList.add("by-points");   // site.css hides the panel's old podium/table/search
  const wrap = document.createElement("div");
  wrap.className = "pts-wrap";
  wrap.innerHTML = `<div class="podium pts-podium"></div>
    <div class="verified-legend"><span class="vbadge">✓</span> Verified ranking</div>
    <div class="leaderboard-search"><input class="leaderboard-search-input pts-search" type="text" placeholder="Search player name" aria-label="Search player name"></div>
    <div class="table-wrap"><table>
      <thead><tr><th class="rank-col">#</th><th>Player</th><th>Rating</th><th>Pts</th></tr></thead>
      <tbody class="pts-body"><tr><td colspan="4">Loading ranking...</td></tr></tbody>
    </table></div>`;
  panel.appendChild(wrap);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let me = "";
  try { me = String(JSON.parse(localStorage.getItem("dpcPlayerSession") || "{}").name || "").trim().toLowerCase(); } catch (e) {}

  let rows = [];
  const search = wrap.querySelector(".pts-search");
  function render() {
    const q = search.value.trim().toLowerCase();
    const podium = wrap.querySelector(".pts-podium");
    const showPodium = !q && rows.length >= 3 && typeof podiumMarkup === "function";   // podiumMarkup: script.js
    podium.hidden = !showPodium;
    if (showPodium) podium.innerHTML = podiumMarkup(rows.slice(0, 3), { value: (p) => p.score, podSub: (p) => "Rating " + Number(p.rating).toFixed(2) });
    const list = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : showPodium ? rows.slice(3) : rows;
    const body = wrap.querySelector(".pts-body");
    if (!list.length) { body.innerHTML = `<tr><td colspan="4">${q ? "No players found for that search." : "No ranking entries yet."}</td></tr>`; return; }
    body.innerHTML = list.map((r) => {
      const rating = Number(r.rating);
      const sub = `${r.mp} matches${r.tied ? " · tied" : ""}`;
      const cell = typeof playerCell === "function" ? playerCell(r, null, sub) : `<span class="player-name">${esc(r.name)}</span>`;   // playerCell: script.js
      return `<tr class="${me && r.name.toLowerCase() === me ? "highlight" : ""}">
        <td><span class="rank-text">${r.rank}</span></td>
        <td>${cell}</td>
        <td class="stat-cell">${isNaN(rating) ? "—" : rating.toFixed(2)}</td>
        <td class="stat-cell points-cell pts-cell">${r.score}</td>
      </tr>`;
    }).join("");
  }
  search.addEventListener("input", render);
  // Arriving from another board's search (?q=name) pre-fills this one.
  search.value = new URLSearchParams(location.search).get("q") || "";

  fetch(`${SB.url}/rest/v1/leaderboard_cache?source=eq.${BOARD.source}&select=payload`, { headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}` } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
    .then((data) => {
      const board = ((data[0] && data[0].payload && data[0].payload[BOARD.key]) || [])
        .map((x) => ({ name: String(x.Name || "").trim(), score: Math.round(Number(x.Score) || 0), rating: x.Rating, mp: Number(x["Matches played"]) || 0,
          verified: String(x.Verified ?? x.verified ?? "").trim().toUpperCase() === "TRUE" }))
        .filter((x) => x.name && x.mp >= MIN_MATCHES)
        .sort((a, b) => b.score - a.score || Number(b.rating) - Number(a.rating) || a.name.localeCompare(b.name));
      board.forEach((x, i) => {   // equal points share a rank: 1, 2, 2, 4
        const prev = board[i - 1], next = board[i + 1];
        x.rank = prev && prev.score === x.score ? prev.rank : i + 1;
        x.tied = Boolean((prev && prev.score === x.score) || (next && next.score === x.score));
      });
      rows = board;
      render();
    })
    .catch((e) => {
      window.DPC?.report("Leaderboard: ranking by points", e);
      wrap.querySelector(".pts-body").innerHTML = `<tr><td colspan="4">Couldn't load the ranking. Try again in a minute.</td></tr>`;
    });
})();
