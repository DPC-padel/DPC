// Shared footer for every page: the main links, then a quiet row with the company
// name and policies. It takes the page's own colours and font, so it fits the DPC
// pages and the League pages alike. The home page has the same links in its own footer.
(function () {
  if (document.querySelector(".site-foot")) return;
  const css = document.createElement("style");
  css.textContent = `
.site-foot,.site-foot *{text-transform:none;letter-spacing:normal;text-align:left;font-weight:400}
.site-foot{display:block;max-width:1100px;margin:0 auto;padding:32px 24px calc(28px + env(safe-area-inset-bottom,0px));font-size:13px;line-height:1.6;color:inherit}
.site-foot a{color:inherit;text-decoration:none}
.site-foot a:hover{text-decoration:underline;text-underline-offset:3px}
.site-foot .sf-main{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;opacity:.6;margin-bottom:16px}
.site-foot .sf-main a{font-weight:600;letter-spacing:2px;text-transform:uppercase}
.site-foot .sf-legal{display:flex;flex-wrap:wrap;gap:6px 16px;padding-top:14px;border-top:1px solid rgba(127,127,127,.22);font-size:12px;opacity:.5}`;
  // A div, not <footer>: some pages style every footer element, and that shouldn't leak in.
  const f = document.createElement("div");
  f.className = "site-foot";
  f.setAttribute("role", "contentinfo");
  f.innerHTML = `<nav class="sf-main" aria-label="Site"><a href="/league/">League</a><a href="/legal/pricing/">Pricing</a><a href="/legal/contact/">Contact</a><a href="https://instagram.com/delhipadelcollective" target="_blank" rel="noopener">Instagram</a></nav>
<div class="sf-legal"><span>© 2026 Rebound Rally Private Limited</span><a href="/legal/terms/">Terms</a><a href="/legal/privacy/">Privacy</a><a href="/legal/refunds/">Cancellation &amp; refunds</a><a href="/legal/service-delivery/">Service delivery</a></div>`;
  document.head.append(css);
  document.body.append(f);
  // Keep the footer clear of anything fixed to the bottom: the app-style bottom bar,
  // the League's sticky Register bar, and the League help bubble.
  const clear = () => {
    let h = 0;
    document.querySelectorAll(".bottom-nav, #sticky").forEach((b) => { if (getComputedStyle(b).display !== "none") h += b.offsetHeight; });
    if (document.querySelector(".faq-btn")) h += 72;
    f.style.marginBottom = h ? h + "px" : "";
  };
  clear(); addEventListener("resize", clear);
})();
