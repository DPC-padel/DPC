// League stats page: the numbers computed from league_events rows.
import { readFileSync } from "node:fs";
import { ROOT, suite, test, eq } from "./lib/harness.mjs";

const { computeStats } = new Function(readFileSync(ROOT + "league/stats/stats.js", "utf8") + "\nreturn { computeStats };")();
const T = 1_800_000_000;
const ev = (dt, vid, sid, page, event, detail = "", src = "instagram", device = "mobile") => [T + dt, vid, sid, page, event, detail, src, device];

const rows = [
  // a: League page → Register → finishes the form in 200s
  ev(0, "a", "s1", "league", "view"), ev(5, "a", "s1", "league", "click", "hero_register"),
  ev(6, "a", "s1", "register", "view"), ev(10, "a", "s1", "register", "start", "player"),
  ev(20, "a", "s1", "register", "field", "availability"), ev(40, "a", "s1", "register", "field", "name"),
  ev(200, "a", "s1", "register", "submit", "player"), ev(210, "a", "s1", "register", "success", "player"),
  // b: straight to the form from WhatsApp, quits after date of birth, Register blocked on phone
  ev(0, "b", "s2", "register", "view", "", "whatsapp"), ev(3, "b", "s2", "register", "start", "player", "whatsapp"),
  ev(9, "b", "s2", "register", "field", "dob", "whatsapp"), ev(12, "b", "s2", "register", "submit", "player", "whatsapp"),
  ev(12, "b", "s2", "register", "invalid", "phone", "whatsapp"),
  // c: looks at the League page only, on desktop
  ev(0, "c", "s3", "league", "view", "", "direct", "desktop"),
];
const regs = [{ level: "Intermediate", gender: "Male", availability: "Both weekends", dob: "1996-05-01" }];
const s = computeStats(rows, regs, new Date((T + 0) * 1000));

suite("League stats · headline numbers");
test("visitors, starts, registrations, conversion", () => {
  eq([s.kpi.visitors, s.kpi.starts, s.kpi.registered], [3, 2, 1]);
  eq(Math.round(s.kpi.conversion), 33);
  eq(s.kpi.completion, 50);
  eq(s.kpi.medianSeconds, 200);
});

suite("League stats · funnel and drop-off");
test("funnel counts sessions at each step, in form order", () => {
  eq(s.funnel.map((f) => f.n), [2, 1, 2, 2, 1, 2, 0, 0, 2, 1]);
  eq(s.funnel.map((f) => f.label).slice(4, 8), ["The dates", "Your details", "Your padel", "Your kit"]);
});
test("quit point is the last question answered by those who didn't register", () => {
  eq(s.quit, [{ label: "Date of birth", n: 1, pct: 100 }]);
  eq(s.blocked, { "WhatsApp number": 1 });
});

suite("League stats · sources, days and who");
test("sources ranked by visitors with their conversion", () => {
  eq(s.sources.map((x) => [x.key, x.visitors, x.registered]), [["instagram", 1, 1], ["whatsapp", 1, 0], ["direct", 1, 0]]);
});
test("age band from date of birth", () => eq(s.who.age, { "25–34": 1 }));
