// Ranking tab (Break Point and First Serve boards): ranked by Pts — total
// match points — with each player's rating beside their name and their Pts
// large on the right. It fills the existing Ranking panel and replaces that
// panel's rating-ordered table. The podium stays (same look, top 3 by Pts) and
// the list continues from #4; while searching, the podium hides and every
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
    <input class="pts-search" type="search" placeholder="Search player name" aria-label="Search player name">
    <div class="pts-head" aria-hidden="true"><span>#</span><span>Player · rating</span><span>Pts</span></div>
    <ol class="pts-list"><li class="pts-empty">Loading…</li></ol>`;
  panel.appendChild(wrap);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Same colours as the levels on the rating explainer.
  const BAND = [[0, "#9c968b"], [1, "#6f9a7a"], [2, "#2e4e8e"], [3, "#c8752d"], [4.1, "#7a3b57"], [5, "#b58a2e"], [6, "#9d2e2e"]];
  const bandColour = (r) => BAND.filter((b) => r >= b[0]).pop()[1];
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
    wrap.querySelector(".pts-list").innerHTML = list.length ? list.map((r) => {
      const rating = Number(r.rating);
      return `<li class="pts-row${r.rank <= 3 ? " pts-top" : ""}${me && r.name.toLowerCase() === me ? " pts-me" : ""}">
        <span class="pts-rank">${r.rank}</span>
        <span class="pts-player"><span class="pts-name">${esc(r.name)}</span>${isNaN(rating) ? "" : `<span class="pts-rating" style="--band:${bandColour(rating)}">${rating.toFixed(2)}</span>`}
          <span class="pts-mp">${r.mp} matches${r.verified ? ' <span class="vbadge" title="Verified ranking">✓</span>' : ""}${r.tied ? " · tied" : ""}</span></span>
        <span class="pts-score">${r.score}</span></li>`;
    }).join("") : `<li class="pts-empty">${q ? "No player by that name on this board." : "The board fills up after two matches."}</li>`;
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
      wrap.querySelector(".pts-list").innerHTML = `<li class="pts-empty">Couldn't load the ranking. Try again in a minute.</li>`;
    });
})();
