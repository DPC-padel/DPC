// Player registrations close at CLOSES_AT. Until then the "Register" buttons (data-reg-closed)
// open the form; after it they show a short notice, and the register page swaps its form for
// a closed message (html.reg-closed). Used on the League page, the home page, Games and the form.
(function () {
  const CLOSES_AT = new Date("2026-10-30T19:40:00+05:30");
  const isClosed = () => Date.now() >= CLOSES_AT;
  const mark = () => document.documentElement.classList.toggle("reg-closed", isClosed());
  mark();
  if (!isClosed()) setTimeout(mark, CLOSES_AT - Date.now());   // a page left open closes on time

  let t, timer;
  function notice() {
    if (!t) {
      const css = document.createElement("style");
      css.textContent = `
.reg-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,16px);z-index:1000;width:max-content;max-width:min(92vw,420px);padding:14px 18px;border-radius:6px;background:#1f4d36;color:#f8f4ea;font:500 15px/1.45 'Albert Sans',-apple-system,system-ui,sans-serif;text-align:center;box-shadow:0 12px 32px -12px rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.reg-toast.on{opacity:1;transform:translate(-50%,0)}
.reg-toast b{display:block;font-weight:600;margin-bottom:2px}`;
      document.head.append(css);
      t = document.createElement("div");
      t.className = "reg-toast";
      t.setAttribute("role", "status");
      t.innerHTML = "<b>Player registrations are closed.</b>Thank you to everyone who signed up. Squads are picked at Auction Night on 1st November.";
      document.body.append(t);
      t.offsetWidth;   // so the first show animates
    }
    t.classList.add("on");
    clearTimeout(timer); timer = setTimeout(() => t.classList.remove("on"), 4000);
  }

  // Capture phase, so a card's own click handler can't open anything first.
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-reg-closed]")) return;
    e.preventDefault(); e.stopPropagation();
    if (isClosed()) notice(); else location.href = "/league/register/";
  }, true);

  // A form opened before the deadline can't be sent after it.
  document.addEventListener("submit", (e) => {
    if (e.target.matches("form[data-form=player]") && isClosed()) { e.preventDefault(); e.stopImmediatePropagation(); mark(); notice(); }
  }, true);
})();
