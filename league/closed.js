// Player registrations are closed: any "Register" button marked data-reg-closed shows a
// short notice instead of opening the form. Used on the League page, the home page and Games.
(function () {
  const css = document.createElement("style");
  css.textContent = `
.reg-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translate(-50%,16px);z-index:1000;width:max-content;max-width:min(92vw,420px);padding:14px 18px;border-radius:6px;background:#1f4d36;color:#f8f4ea;font:500 15px/1.45 'Albert Sans',-apple-system,system-ui,sans-serif;text-align:center;box-shadow:0 12px 32px -12px rgba(0,0,0,.4);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}
.reg-toast.on{opacity:1;transform:translate(-50%,0)}
.reg-toast b{display:block;font-weight:600;margin-bottom:2px}`;
  document.head.append(css);
  const t = document.createElement("div");
  t.className = "reg-toast";
  t.setAttribute("role", "status");
  t.innerHTML = "<b>Player registrations are closed.</b>Thank you to everyone who signed up. Squads are picked at Auction Night on 1st November.";
  document.body.append(t);
  let timer;
  // Capture phase, so a card's own click handler can't open anything first.
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-reg-closed]")) return;
    e.preventDefault(); e.stopPropagation();
    t.classList.add("on");
    clearTimeout(timer); timer = setTimeout(() => t.classList.remove("on"), 4000);
  }, true);
})();
