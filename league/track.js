// Anonymous League analytics → Supabase league_events (insert-only; see league-events.sql).
// No names, phones or emails: a random visitor id (this browser), a session id
// (this tab), the page, and what happened. The stats page (league/stats/) reads it.
(function () {
  const SB = { url: "https://zruqzybdpniofxbcwuat.supabase.co", key: "sb_publishable_O5kl7By_s23gMXNULck-yw_cksU-9Oy" };
  const rid = () => Math.random().toString(36).slice(2, 12);
  const keep = (store, k) => { try { let v = store.getItem(k); if (!v) store.setItem(k, v = rid()); return v; } catch (e) { return rid(); } };
  const vid = keep(localStorage, "dplVid"), sid = keep(sessionStorage, "dplSid");
  const page = location.pathname.includes("/register") ? "register" : "league";
  const device = matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";

  // Where this session came from: ?utm_source=…, else the referring site, else direct. Kept for the tab.
  let src;
  try { src = sessionStorage.getItem("dplSrc"); } catch (e) {}
  if (!src) {
    const q = new URLSearchParams(location.search).get("utm_source");
    let ref = "";
    try { ref = new URL(document.referrer).hostname.replace(/^www\./, ""); } catch (e) {}
    src = (q || (ref && !ref.endsWith("padelcollectiveindia.com") ? ref : "") || (ref ? "dpc site" : "direct")).toLowerCase().slice(0, 60);
    try { sessionStorage.setItem("dplSrc", src); } catch (e) {}
  }

  function track(event, detail) {
    try {
      fetch(`${SB.url}/rest/v1/league_events`, { method: "POST", keepalive: true,
        headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ vid, sid, page, event, detail: String(detail || "").slice(0, 80), src, device }) }).catch(() => {});
    } catch (e) {}
  }
  window.dplTrack = track;
  track("view");

  // Clicks on tagged buttons and on any link to the registration page.
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-track], a[href*='register']");
    if (el) track("click", el.dataset.track || "register_link");
  });

  // Form progress: first touch, then each field the first time it's answered.
  document.querySelectorAll("form[data-form]").forEach((f) => {
    const seen = new Set();
    let started = false;
    const touch = (e) => {
      const name = e.target.name;
      if (!name) return;
      if (!started) { started = true; track("start", f.dataset.form); }
      if (e.type === "change" || e.type === "input") {
        if (!seen.has(name)) { seen.add(name); track("field", name); }
      }
    };
    f.addEventListener("focusin", touch);
    f.addEventListener("change", touch);
    // Which required field stops a Register press.
    f.addEventListener("submit", () => {
      track("submit", f.dataset.form);
      const bad = f.querySelector("input:invalid, select:invalid, textarea:invalid");
      if (bad) track("invalid", bad.name);
    }, true);
  });
})();
