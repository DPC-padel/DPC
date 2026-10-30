// League help bubble: a round button in the bottom-right of the League page and
// the registration form. It opens a list of questions: tap one and its answer opens
// right under it. Anything not covered goes to WhatsApp. Edit the answers here
// (a line break in an answer shows as a new line).
const DPL_FAQ = [
  ["What is the Delhi Padel League?", "Delhi's first franchise-based padel league: eight franchises, 120 players and one champion, across three weekends this November in New Delhi."],
  ["When are the matches?", "Group stage: Fri 20 – Sun 22 Nov. Semis and finals: Sat 28 – Sun 29 Nov."],
  ["What are the match timings?", "Your exact schedule depends on your team and its fixtures. Tentative timings:\n\nGroup stage (your team plays 3 ties)\nFri 20 Nov: 4–10 pm\nSat 21 Nov: 8 am–10 pm\nSun 22 Nov: 8 am–10 pm\n\nKnockouts, if your team makes it\nSat 28 Nov (semis): 4–10 pm\nSun 29 Nov (finals): 6–9 pm\n\nWith so many players and matches, we can't take requests to change match timings."],
  ["Where will it be played?", "At two venues in New Delhi. The exact location will be shared this week."],
  ["How do I get into a team?", "Player registrations are now closed. Franchise owners build their squads from the registered players at Auction Night on 1st November."],
  ["What if I can't play every day?", "That's fine. Mark the days you can't play in the form. Teams will see it, and it will affect whether they pick you."],
  ["Why do you ask about tournaments?", "Your results help us understand where to place you in the auction. Please share every tournament you've played in the last year."],
  ["How should I rate myself?", "Pick the level that honestly matches how you play today. It helps us place you, and teams see it at the auction."],
  ["Is there an entry fee?", "Yes, for players picked at the auction. We'll share the fee and how to pay on WhatsApp."],
  ["I registered. What happens next?", "Franchises pick their squads at Auction Night on 1st November. We'll get in touch on WhatsApp after that."],
  ["Can I change my answers?", "Yes. Message us on WhatsApp and we'll update your registration."],
];
const DPL_WHATSAPP = "919211264111";

(function () {
  const track = (d) => window.dplTrack?.("click", d);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  const btn = el("button", "faq-btn");
  btn.type = "button";
  btn.setAttribute("aria-label", "Questions about the league");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", "faqPanel");
  btn.innerHTML = '<span class="faq-tag">Questions?</span><span class="faq-dot" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.5-2.2 2-2.2 3.2"/><path d="M12 16.6h.01"/></svg></span>';

  const panel = el("div", "faq-panel");
  panel.id = "faqPanel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "League questions");
  panel.innerHTML = '<div class="faq-head"><p>DPL help</p><button type="button" class="faq-x" aria-label="Close">×</button></div>';
  const log = el("div", "faq-log");
    const chips = el("div", "faq-chips");
  const foot = el("div", "faq-foot");
  foot.innerHTML = `<span>Still stuck?</span><a class="faq-wa" target="_blank" rel="noopener" href="https://wa.me/${DPL_WHATSAPP}?text=${encodeURIComponent("Hi, I have a question about the Delhi Padel League:")}">Ask on WhatsApp</a>`;
  panel.append(log, foot);
  log.append(el("p", "faq-bot", "Hi! What would you like to know about the league?"), chips);

  // Tapping a question opens its answer right under it; one open at a time.
  DPL_FAQ.forEach(([q, a], i) => {
    const c = el("button", "faq-chip", q), ans = el("p", "faq-ans", a);
    c.type = "button";
    c.id = "faqQ" + i; ans.id = "faqA" + i;
    c.setAttribute("aria-expanded", "false");
    c.setAttribute("aria-controls", ans.id);
    ans.hidden = true;
    c.addEventListener("click", () => {
      const open = ans.hidden;
      chips.querySelectorAll(".faq-chip[aria-expanded=true]").forEach((o) => { o.setAttribute("aria-expanded", "false"); o.nextSibling.hidden = true; });
      if (open) { ans.hidden = false; c.setAttribute("aria-expanded", "true"); track("faq: " + q); }
    });
    chips.append(c, ans);
  });

  function toggle(open) {
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("faq-open", open);
    if (open) { track("faq_open"); panel.querySelector(".faq-x").focus(); } else btn.focus();
  }
  btn.addEventListener("click", () => toggle(panel.hidden));
  panel.querySelector(".faq-x").addEventListener("click", () => toggle(false));
  foot.querySelector(".faq-wa").addEventListener("click", () => track("faq_whatsapp"));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) toggle(false); });
  document.body.append(panel, btn);
})();
