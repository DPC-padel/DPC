// Games (calendar): sheet date/time parsing, saving an RSVP, partner sign-ups,
// and finding your own registration.
import { readFileSync } from "node:fs";
import { ROOT, loadFns, suite, test, ok, eq, rejects } from "./lib/harness.mjs";

const cfgSrc = readFileSync(ROOT + "calender/config.js", "utf8");
// config.js has no top-level DOM use → evaluate it whole.
const cfg = new Function(cfgSrc + "\nreturn { Sheets, parseSheetDate, formatTime, normalizeTimeValue, formatTimeRange, formatDayLabel, genId };")();
const ymd = (d) => d && [d.getFullYear(), d.getMonth() + 1, d.getDate()];

suite("Games · dates as the sheet sends them");

test("YYYY-MM-DD", () => eq(ymd(cfg.parseSheetDate("2026-09-20")), [2026, 9, 20]));
test("ISO with a time keeps the calendar date", () => eq(ymd(cfg.parseSheetDate("2026-09-20T18:30:00.000Z")), [2026, 9, 20]));
test("DD/MM/YYYY (Indian locale)", () => {
  eq(ymd(cfg.parseSheetDate("20/09/2026")), [2026, 9, 20]);
  eq(ymd(cfg.parseSheetDate("5/1/2027")), [2027, 1, 5]);
});
test("a Date object passes through", () => eq(ymd(cfg.parseSheetDate(new Date(2026, 8, 20))), [2026, 9, 20]));
test("blank or junk gives null, never an Invalid Date", () => {
  for (const v of ["", "   ", null, undefined, "not a date"]) eq(cfg.parseSheetDate(v), null, `for ${JSON.stringify(v)}`);
});

suite("Games · times and day labels");

test("24h text becomes 12h", () => {
  eq(cfg.formatTime("18:30"), "6:30 PM");
  eq(cfg.formatTime("09:05"), "9:05 AM");
  eq(cfg.formatTime("00:00"), "12:00 AM");
  eq(cfg.formatTime("12:00"), "12:00 PM");
  eq(cfg.formatTime("18:30:00"), "6:30 PM");
});
test("Sheets day-fraction numbers", () => {
  eq(cfg.formatTime(0.75), "6:00 PM");
  eq(cfg.formatTime("0.5"), "12:00 PM");
  eq(cfg.formatTime(0), "12:00 AM");
});
test("ISO time strings from the sheet", () => eq(cfg.formatTime("1899-12-30T13:15:00.000Z"), "1:15 PM"));
test("blank or junk gives empty text", () => {
  for (const v of ["", null, undefined, "abc"]) eq(cfg.formatTime(v), "", `for ${JSON.stringify(v)}`);
});
test("time inputs get HH:MM", () => {
  eq(cfg.normalizeTimeValue("9:05"), "09:05");
  eq(cfg.normalizeTimeValue("18:30:00"), "18:30");
  eq(cfg.normalizeTimeValue("1899-12-30T18:30:00.000Z"), "18:30");
  eq(cfg.normalizeTimeValue(""), "");
});
test("time ranges", () => {
  eq(cfg.formatTimeRange("18:00", "20:00"), "6:00 PM – 8:00 PM");
  eq(cfg.formatTimeRange("18:00", ""), "6:00 PM");
  eq(cfg.formatTimeRange("", "20:00"), "");
});
test("day labels with the right suffix", () => {
  eq(cfg.formatDayLabel("2026-09-20"), "Sunday, 20th September");
  for (const [d, suffix] of [["01", "1st"], ["02", "2nd"], ["03", "3rd"], ["11", "11th"], ["12", "12th"], ["13", "13th"], ["21", "21st"], ["22", "22nd"], ["23", "23rd"], ["30", "30th"]])
    ok(cfg.formatDayLabel(`2026-09-${d}`).includes(` ${suffix} `), `${d} → ${cfg.formatDayLabel(`2026-09-${d}`)}`);
  eq(cfg.formatDayLabel(""), "");
});
test("event ids are short and url-safe", () => {
  const ids = Array.from({ length: 20 }, () => cfg.genId());
  ok(ids.every((id) => /^[a-z0-9]{8,}$/.test(id)), `bad id ${ids.find((id) => !/^[a-z0-9]{8,}$/.test(id))}`);
});

suite("Games · saving an RSVP (retries Apps Script hiccups, not real answers)");

const OK = '{"ok":true,"data":{"message":"RSVP saved"}}';
const DUP = '{"ok":false,"error":"Already registered for this event."}';
const HTML = "<html><title>Error</title></html>";
const rsvp = { eventId: "evt1", name: "Test", phone: "9000000000", status: "confirmed" };

function withNetwork(replies, fn) {
  return async () => {
    const calls = [], realFetch = globalThis.fetch, realTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (f) => { queueMicrotask(f); return 0; };
    globalThis.fetch = async (url, opts) => {
      calls.push(JSON.parse(opts.body));
      const r = replies[Math.min(calls.length - 1, replies.length - 1)];
      if (r instanceof Error) throw r;
      return { text: async () => r };
    };
    try { await fn(calls); } finally { globalThis.fetch = realFetch; globalThis.setTimeout = realTimeout; }
  };
}

test("a normal save goes through once", withNetwork([OK], async (calls) => {
  eq(await cfg.Sheets.addRSVP(rsvp), { message: "RSVP saved" });
  eq(calls.length, 1);
}));
test("an HTML error page and a dropped connection are retried", withNetwork([HTML, new TypeError("Failed to fetch"), OK], async (calls) => {
  eq(await cfg.Sheets.addRSVP(rsvp), { message: "RSVP saved" });
  eq(calls.length, 3);
}));
test("a real answer from the script is not retried", withNetwork([DUP], async (calls) => {
  await rejects(cfg.Sheets.addRSVP(rsvp), /Already registered/);
  eq(calls.length, 1);
}));
test("no blank error box when the script gives no reason", withNetwork(['{"ok":false}'], async () => {
  await rejects(cfg.Sheets.addRSVP(rsvp), /Couldn't save your RSVP/);
}));
test("gives up after 3 tries with a plain message", withNetwork([HTML], async (calls) => {
  await rejects(cfg.Sheets.addRSVP(rsvp), /Couldn't reach the server/);
  eq(calls.length, 3);
}));

suite("Games · partner sign-ups (the Karan + Jaskaran, Antariksh + Siddharth bug)");

const page = readFileSync(ROOT + "calender/index.html", "utf8");
const START = 'document.getElementById("mSubmit").addEventListener("click",async()=>{';
const hs = page.indexOf(START), he = page.indexOf("\n});\n\nfunction openConfirm", hs);
if (hs < 0 || he < 0) throw new Error("games.test: submit handler not found in calender/index.html");
const handlerBody = page.slice(hs + START.length, he);

// Runs the real submit handler against a fake page and a scripted server.
function signUp({ mode, name, phone, name2 = "", phone2 = "", server, rsvps = [] }) {
  const els = {};
  const el = (id) => (els[id] ??= { value: "", innerHTML: "", textContent: "", disabled: false, classList: { add() {}, remove() {}, toggle() {} } });
  Object.assign(el("rName"), { value: name });
  Object.assign(el("rPhone"), { value: phone });
  Object.assign(el("rName2"), { value: name2 });
  Object.assign(el("rPhone2"), { value: phone2 });
  const posts = [], saved = {}, allRSVPs = [...rsvps];
  const env = {
    document: { getElementById: el }, window: {}, bookingMode: mode, activeMode: "join", activeId: "evt1",
    allEvents: [{ id: "evt1", title: "DPC Sunday Tournament", cost: "2200", link1: "", link2: "" }],
    allRSVPs, saveMyRSVP: (id, d) => { saved[id] = d; },
    sameEventId: (a, b) => String(a ?? "") === String(b ?? ""),
    normalizePhone: (p) => String(p || "").replace(/[^\d+]/g, ""),
    closeModal() {}, render() {}, showToast() {},
    fetch: async (url, opts) => {
      const b = JSON.parse(opts.body);
      posts.push(b.data.phone);
      const q = server[b.data.phone];
      return { text: async () => (q.length > 1 ? q.shift() : q[0]) };
    },
    setTimeout: (f) => { queueMicrotask(f); return 0; },
    clearTimeout() {},
  };
  const { Sheets } = new Function(...Object.keys(env), cfgSrc + "\nreturn { Sheets };")(...Object.values(env));
  const run = new Function("Sheets", ...Object.keys(env), `return (async()=>{${handlerBody}})();`);
  return { submit: () => run(Sheets, ...Object.values(env)), els, posts, saved, allRSVPs };
}

const pair = { mode: "partner", name: "Karan Sehgal", phone: "9000000001", name2: "Jaskaran", phone2: "9000000002" };

test("both save normally", async () => {
  const p = signUp({ ...pair, server: { "9000000001": [OK], "9000000002": [OK] } });
  await p.submit();
  ok(/Both in!/.test(p.els.mMsg.innerHTML), p.els.mMsg.innerHTML);
  eq([p.allRSVPs.length, p.els.mSubmit.textContent], [2, "Done ✓"]);
});

test("player already saved by an earlier try: the partner is still added", async () => {
  const p = signUp({ ...pair, server: { "9000000001": [DUP], "9000000002": [OK] } });
  await p.submit();
  eq(p.posts, ["9000000001", "9000000002"]);
  ok(/Both in!/.test(p.els.mMsg.innerHTML), p.els.mMsg.innerHTML);
});

test("partner keeps failing: the player is told their spot is saved and can tap again", async () => {
  const p = signUp({ ...pair, server: { "9000000001": [OK], "9000000002": [HTML] } });
  await p.submit();
  ok(/Your spot is saved, but we couldn't add your partner yet/.test(p.els.mMsg.innerHTML), p.els.mMsg.innerHTML);
  eq(p.els.mSubmit.disabled, false, "button should be usable again");
  ok(p.saved.evt1, "player should be remembered as registered");
  eq(p.posts.filter((x) => x === "9000000002").length, 3, "partner should be retried 3 times");
});

test("tapping again after that adds the partner without a duplicate player", async () => {
  const p = signUp({ ...pair, rsvps: [{ eventId: "evt1", phone: "9000000001" }], server: { "9000000001": [DUP], "9000000002": [OK] } });
  await p.submit();
  ok(/Both in!/.test(p.els.mMsg.innerHTML), p.els.mMsg.innerHTML);
  eq(p.allRSVPs.filter((r) => r.phone === "9000000001").length, 1);
});

test("signing up alone when already registered still says so", async () => {
  const p = signUp({ mode: "single", name: "Karan Sehgal", phone: "9000000001", server: { "9000000001": [DUP] } });
  await p.submit();
  ok(/Already registered for this event\./.test(p.els.mMsg.innerHTML), p.els.mMsg.innerHTML);
  eq(p.saved.evt1, undefined);
});

test("partner already registered separately counts as success", async () => {
  const p = signUp({ ...pair, server: { "9000000001": [OK], "9000000002": [DUP] } });
  await p.submit();
  ok(/Both in!/.test(p.els.mMsg.innerHTML), p.els.mMsg.innerHTML);
});

test("partner number must differ from yours", async () => {
  const p = signUp({ ...pair, phone2: "9000000001", server: {} });
  await p.submit();
  ok(/must be different/.test(p.els.mMsg.innerHTML), p.els.mMsg.innerHTML);
  eq(p.posts.length, 0, "nothing should be sent");
});

suite("Games · finding your own registration");

const mine = (rsvps) => loadFns("calender/index.html", ["normalizePhone", "sameEventId", "findStoredRSVP"], "var allRSVPs = " + JSON.stringify(rsvps) + ";");

test("matches by phone, ignoring spaces and dashes", () => {
  const H = mine([{ eventId: "evt1", phone: "98101-78983", name: "K" }]);
  eq(H.findStoredRSVP("evt1", { phone: "98101 78983" })?.name, "K");
});
test("falls back to your name, case-insensitive", () => {
  const H = mine([{ eventId: "evt1", phone: "1", name: "Karan Sehgal" }]);
  eq(H.findStoredRSVP("evt1", { phone: "2", name: " karan sehgal " })?.phone, "1");
});
test("another event's registration isn't yours", () => {
  const H = mine([{ eventId: "evt2", phone: "9000000001", name: "K" }]);
  eq(H.findStoredRSVP("evt1", { phone: "9000000001" }), null);
});
test("nothing stored on this phone gives null", () => eq(mine([]).findStoredRSVP("evt1", null), null));
