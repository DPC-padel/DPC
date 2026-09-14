// DPC error handling — shared by every page, loaded first in <head>.
// - Catches uncaught errors and failed promises, shows a short message, reports them.
// - Pages call DPC.report(where, err) in their own catch blocks,
//   DPC.toast(msg) when an action fails (mockup B),
//   DPC.loadError(el, { title, onRetry }) when a load fails (mockup A).
// Reports go to the "DPC Errors" Apps Script, which logs them and emails an alert.

// "DPC Errors" web app /exec URL. Empty = errors are still shown and logged to the console, just not emailed.
const DPC_ERRORS_URL = "https://script.google.com/a/macros/padelcollectiveindia.com/s/AKfycbz5QYydkzwYwq1-gL8n5YTiLy1cqoaN2kEr9XWybOiZuC25-vAmoMh2F5-cXKfzUBwyrw/exec";

// Noise that isn't a site bug: cross-origin scripts with no detail, video autoplay
// refusals, ResizeObserver chatter, browser extensions.
function dpcIgnorable(message, source) {
  const m = String(message || "").trim();
  if (!m || /^Script error\.?$/.test(m)) return true;
  if (/ResizeObserver loop|NotAllowedError|AbortError|play\(\) request/i.test(m)) return true;
  if (source && /^(chrome|moz|safari|safari-web)-extension:/.test(String(source))) return true;
  return false;
}

// What gets sent. Path only — query strings can carry phone numbers.
function dpcPayload(where, err, loc, ua) {
  const e = err instanceof Error ? err
    : new Error(typeof err === "string" ? err : (err && err.message) || String(err));
  return {
    kind: "site",
    page: String((loc && loc.pathname) || ""),
    message: ((where ? where + ": " : "") + (e.message || e.name || "Unknown error")).slice(0, 500),
    detail: String(e.stack || "").slice(0, 2000),
    userAgent: String(ua || "").slice(0, 300),
  };
}

// At most `max` reports per page load, each distinct error once — a loop can't flood your inbox.
function dpcReporter(send, max) {
  const seen = new Set();
  let n = 0;
  return function (payload) {
    const key = payload.page + "|" + payload.message;
    if (n >= max || seen.has(key)) return false;
    seen.add(key); n++;
    send(payload);
    return true;
  };
}

const DPC = (() => {
  const beacon = dpcReporter((p) => {
    if (!DPC_ERRORS_URL || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;   // testing on this Mac never emails
    const body = JSON.stringify(p);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(DPC_ERRORS_URL, new Blob([body], { type: "text/plain" }))) return;
    } catch (_) {}
    fetch(DPC_ERRORS_URL, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" }, body }).catch(() => {});
  }, 5);

  function report(where, err) {
    try {
      const raw = err instanceof Error ? err.message : (err && err.message) || err;
      if (dpcIgnorable(raw)) return;
      console.error("[DPC]", where || "", err);
      beacon(dpcPayload(where, err, location, navigator.userAgent));
    } catch (_) {}
  }

  let styled = false;
  function styles() {
    if (styled) return; styled = true;
    const s = document.createElement("style");
    s.textContent =
      ".dpc-toast{position:fixed;left:16px;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:9999;display:flex;align-items:center;gap:10px;max-width:520px;margin:0 auto;padding:10px 6px 10px 12px;border:1px solid rgba(220,38,38,.25);border-radius:14px;background:#fef2f2;color:var(--danger,#dc2626);font:500 13px/1.4 var(--font-body,system-ui,sans-serif);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s}" +
      ".dpc-toast.show{opacity:1;transform:none;pointer-events:auto}" +
      ".dpc-toast svg{flex:none}.dpc-toast-msg{flex:1}" +
      ".dpc-toast-x{flex:none;width:32px;height:32px;border:0;background:none;color:inherit;font-size:20px;line-height:1;cursor:pointer}" +
      ".dpc-load-error{grid-column:1/-1;margin:12px 0;padding:20px 16px;border:1px solid var(--border,#e5e7eb);border-radius:var(--radius,16px);background:var(--surface,#fff);text-align:left}" +
      ".dpc-le-title{margin:0 0 6px;font:600 15px/1.3 var(--font-body,system-ui,sans-serif);color:inherit}" +
      ".dpc-le-body{margin:0 0 16px;font:400 13px/1.5 var(--font-body,system-ui,sans-serif);color:var(--text-secondary,#64748b)}" +
      ".dpc-le-retry{width:100%;height:42px;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:var(--surface,#fff);color:inherit;font:600 14px var(--font-body,system-ui,sans-serif);cursor:pointer}";
    document.head.appendChild(s);
  }

  // Mockup B: short message above the bottom bar, dismissable, hides after 6s.
  function toast(msg) {
    try {
      styles();
      let el = document.getElementById("dpc-toast");
      if (!el) {
        el = document.createElement("div");
        el.id = "dpc-toast"; el.className = "dpc-toast"; el.setAttribute("role", "alert");
        el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg><span class="dpc-toast-msg"></span><button type="button" class="dpc-toast-x" aria-label="Dismiss">&times;</button>';
        el.querySelector("button").addEventListener("click", () => el.classList.remove("show"));
        document.body.appendChild(el);
      }
      el.querySelector(".dpc-toast-msg").textContent = msg;
      el.classList.add("show");
      clearTimeout(el._hide);
      el._hide = setTimeout(() => el.classList.remove("show"), 6000);
    } catch (_) {}
  }

  // Mockup A: replaces a list that failed to load with a card and a Try again button.
  function loadError(target, opts) {
    const o = opts || {};
    try {
      if (!target) return;
      styles();
      const card = document.createElement("div");
      card.className = "dpc-load-error"; card.setAttribute("role", "alert");
      const t = document.createElement("p"); t.className = "dpc-le-title"; t.textContent = o.title || "Couldn't load this";
      const b = document.createElement("p"); b.className = "dpc-le-body";
      b.textContent = (o.body || "Check your connection and try again.") + (DPC_ERRORS_URL ? " We've been notified." : "");
      const r = document.createElement("button"); r.type = "button"; r.className = "dpc-le-retry"; r.textContent = "Try again";
      r.addEventListener("click", () => (o.onRetry ? o.onRetry() : location.reload()));
      card.append(t, b, r);
      target.innerHTML = "";
      target.appendChild(card);
    } catch (_) {}
  }

  // Anything no page caught: report it and tell the player once per page load.
  let told = false;
  function uncaught(err, source) {
    const raw = err instanceof Error ? err.message : (err && err.message) || err;
    if (dpcIgnorable(raw, source)) return;
    report("Uncaught", err);
    if (!told) { told = true; toast("Something went wrong. Refresh the page and try again."); }
  }
  window.addEventListener("error", (e) => uncaught(e.error || e.message, e.filename));
  window.addEventListener("unhandledrejection", (e) => uncaught(e.reason));

  return { report, toast, loadError };
})();
// Pages call window.DPC?.… — a top-level const isn't a window property, so publish it.
window.DPC = DPC;
