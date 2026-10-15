// League registration analytics: turns league_events rows (from league/track.js)
// and the registration mix into the numbers the stats page shows. Pure, no DOM.
// Row: [epochSeconds, vid, sid, page, event, detail, src, device]

const FIELD_LABELS = {
  availability: "Which dates", consent: "Confirm / consent boxes", name: "Full name", phone: "WhatsApp number",
  email: "Email", gender: "Gender", dob: "Date of birth", instagram: "Instagram", experience: "How long playing",
  level: "Self rating", side: "Preferred side", tournament: "Tournament result", tshirt: "T-shirt size",
};
// Form order (league/register/index.html): each step counts sessions that answered any of its questions.
const STEPS = [
  ["The dates", ["availability"]],
  ["Your details", ["name", "phone", "email", "gender", "dob", "instagram"]],
  ["Your padel", ["experience", "level", "side", "tournament"]],
  ["Your kit", ["tshirt"]],
];
const REGISTER_CLICKS = new Set(["hero_register", "path_play", "register_link"]);

function computeStats(rows, regs, now) {
  const S = new Map();   // sid → session summary
  for (const [t, vid, sid, page, event, detail, src, device] of rows) {
    let s = S.get(sid);
    if (!s) S.set(sid, s = { vid, src: src || "direct", device: device || "unknown", pages: new Set(), fields: [], first: t,
      clickedRegister: false, start: 0, submit: false, success: 0, partnerStart: false, partnerSent: false });
    if (event === "view") s.pages.add(page);
    if (event === "click" && REGISTER_CLICKS.has(detail)) s.clickedRegister = true;
    if (event === "start") { if (detail === "sponsor") s.partnerStart = true; else if (!s.start) s.start = t; }
    if (event === "field" && FIELD_LABELS[detail]) s.fields.push(detail);
    if (event === "submit" && detail === "player") s.submit = true;
    if (event === "success") { if (detail === "sponsor") s.partnerSent = true; else if (!s.success) s.success = t; }
  }
  const sessions = [...S.values()];
  const count = (f) => sessions.filter(f).length;
  const uniq = (list) => new Set(list.map((s) => s.vid)).size;
  const pct = (a, b) => (b ? (100 * a) / b : 0);

  const visitors = uniq(sessions);
  const starts = count((s) => s.start);
  const registered = count((s) => s.success);
  const times = sessions.filter((s) => s.start && s.success > s.start).map((s) => s.success - s.start).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;

  const all = sessions.length;
  const funnel = [
    ["League page", count((s) => s.pages.has("league"))],
    ["Clicked Register", count((s) => s.clickedRegister)],
    ["Form page", count((s) => s.pages.has("register"))],
    ["Started form", starts],
    ...STEPS.map(([label, names]) => [label, count((s) => s.fields.some((f) => names.includes(f)))]),
    ["Pressed Register", count((s) => s.submit)],
    ["Registered", registered],
  ].map(([label, n]) => ({ label, n, pct: pct(n, all) }));

  // Where people quit: the last question answered in sessions that started but didn't register.
  const quit = {};
  sessions.filter((s) => s.start && !s.success).forEach((s) => {
    const k = s.fields.length ? FIELD_LABELS[s.fields[s.fields.length - 1]] : "Opened, answered nothing";
    quit[k] = (quit[k] || 0) + 1;
  });
  const quitTotal = Object.values(quit).reduce((a, b) => a + b, 0);

  const tally = (pick) => { const o = {}; rows.forEach((r) => { const k = pick(r); if (k) o[k] = (o[k] || 0) + 1; }); return o; };
  const blocked = tally((r) => r[4] === "invalid" && (FIELD_LABELS[r[5]] || r[5]));
  const errors = tally((r) => r[4] === "error" && r[5]);
  const clicks = tally((r) => r[4] === "click" && r[5]);

  const groupBy = (key) => {
    const g = {};
    sessions.forEach((s) => (g[s[key]] = g[s[key]] || []).push(s));
    return Object.entries(g).map(([k, list]) => {
      const v = uniq(list), st = list.filter((s) => s.start).length, rg = list.filter((s) => s.success).length;
      return { key: k, visitors: v, sessions: list.length, starts: st, registered: rg, conv: pct(rg, v) };
    }).sort((a, b) => b.visitors - a.visitors);
  };

  // Daily, in India time.
  const day = (t) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);
  const days = {};
  const d = (k) => (days[k] = days[k] || { vids: new Set(), starts: 0, registered: 0 });
  sessions.forEach((s) => { const x = d(day(s.first)); x.vids.add(s.vid); if (s.start) x.starts++; if (s.success) x.registered++; });
  const daily = Object.keys(days).sort().map((k) => ({ day: k, visitors: days[k].vids.size, starts: days[k].starts, registered: days[k].registered }));

  // Who's registering (from the registrations themselves).
  const mix = (k) => { const o = {}; regs.forEach((r) => { const v = r[k] || "—"; o[v] = (o[v] || 0) + 1; }); return o; };
  const ages = {};
  regs.forEach((r) => {
    const b = r.dob ? new Date(r.dob) : null;
    const age = b && !isNaN(b) ? Math.floor((now - b) / 31557600000) : null;
    const band = age == null ? "—" : age < 25 ? "Under 25" : age < 35 ? "25–34" : age < 45 ? "35–44" : "45+";
    ages[band] = (ages[band] || 0) + 1;
  });

  return {
    kpi: { visitors, sessions: all, starts, registered, conversion: pct(registered, visitors), completion: pct(registered, starts),
      medianSeconds: median, partnerStarts: count((s) => s.partnerStart), partnerSent: count((s) => s.partnerSent), totalRegs: regs.length },
    funnel, quit: Object.entries(quit).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, n, pct: pct(n, quitTotal) })),
    blocked, errors, clicks, sources: groupBy("src"), devices: groupBy("device"), daily,
    who: { level: mix("level"), gender: mix("gender"), availability: mix("availability"), experience: mix("experience"), age: ages },
  };
}
