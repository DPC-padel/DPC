// Shared error handling (errors.js): what's ignored, what's sent, the flood limit,
// the on-page messages, and that every page loads it first.
import { readFileSync, readdirSync } from "node:fs";
import { ROOT, loadFns, suite, test, ok, eq } from "./lib/harness.mjs";

const E = loadFns("errors.js", ["dpcIgnorable", "dpcPayload", "dpcReporter"]);
const SITE_FILE = "https://www.padelcollectiveindia.com/calender/config.js?v=9";

suite("Errors · noise that isn't a site bug is ignored");

test("cross-origin 'Script error.' and empty messages", () => {
  for (const m of ["Script error.", "Script error", "", "   ", null, undefined])
    ok(E.dpcIgnorable(m), `should ignore ${JSON.stringify(m)}`);
});

test("video autoplay refusals and ResizeObserver chatter", () => {
  for (const m of [
    "NotAllowedError: play() failed because the user didn't interact with the document first.",
    "The play() request was interrupted by a call to pause().",
    "AbortError: The operation was aborted.",
    "ResizeObserver loop completed with undelivered notifications.",
  ]) ok(E.dpcIgnorable(m), `should ignore ${m}`);
});

test("errors thrown inside browser extensions", () => {
  for (const s of ["chrome-extension://abc/content.js", "moz-extension://abc/x.js", "safari-web-extension://abc/x.js"])
    ok(E.dpcIgnorable("x is not defined", s), s);
});

test("real site errors are kept", () => {
  for (const m of [
    "Failed to fetch",
    "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
    "Cannot read properties of null (reading 'innerHTML')",
    "Couldn't reach the server. Please try again.",
  ]) ok(!E.dpcIgnorable(m, SITE_FILE), `should keep ${m}`);
});

suite("Errors · what gets sent");

const loc = { pathname: "/Dashboard/", search: "?phone=9000000001", href: "https://www.padelcollectiveindia.com/Dashboard/?phone=9000000001" };

test("page path only — a phone number in the address never leaves the browser", () => {
  const p = E.dpcPayload("Dashboard: load", new Error("Failed to fetch"), loc, "Safari");
  eq(p.page, "/Dashboard/");
  ok(!JSON.stringify(p).includes("9000000001"), "phone number leaked into the report");
});

test("says where it happened and what went wrong", () => {
  const p = E.dpcPayload("Games: load", new Error("Failed to fetch"), loc, "Safari");
  eq([p.kind, p.message, p.userAgent], ["site", "Games: load: Failed to fetch", "Safari"]);
});

test("strings, error-like objects and nothing still give a readable message", () => {
  eq(E.dpcPayload("", "boom", loc, "").message, "boom");
  eq(E.dpcPayload("Login", { message: "bad" }, loc, "").message, "Login: bad");
  eq(E.dpcPayload("Login", undefined, loc, "").message, "Login: undefined");
});

test("long messages, stacks and browser names are capped", () => {
  const big = "x".repeat(5000), e = new Error(big);
  e.stack = big;
  const p = E.dpcPayload("w", e, loc, big);
  ok(p.message.length <= 500 && p.detail.length <= 2000 && p.userAgent.length <= 300,
    JSON.stringify([p.message.length, p.detail.length, p.userAgent.length]));
});

suite("Errors · flood limit (a loop can't flood your inbox)");

const sender = () => { const sent = []; return { sent, send: (p) => sent.push(p) }; };

test("the same error is sent once", () => {
  const s = sender(), r = E.dpcReporter(s.send, 5);
  r({ page: "/", message: "a" }); r({ page: "/", message: "a" });
  eq(s.sent.length, 1);
});

test("the same message on two pages counts twice", () => {
  const s = sender(), r = E.dpcReporter(s.send, 5);
  r({ page: "/a", message: "m" }); r({ page: "/b", message: "m" });
  eq(s.sent.length, 2);
});

test("stops at the per-page cap", () => {
  const s = sender(), r = E.dpcReporter(s.send, 5);
  for (let i = 0; i < 20; i++) r({ page: "/", message: "m" + i });
  eq(s.sent.length, 5);
});

test("tells the caller whether it sent", () => {
  const r = E.dpcReporter(() => {}, 1);
  eq([r({ page: "/", message: "a" }), r({ page: "/", message: "b" })], [true, false]);
});

// ── the whole file, running in a fake browser page ──
function fakePage() {
  const byId = {}, sent = [], logged = [], listeners = {};
  const make = () => {
    const el = {
      children: [], attrs: {}, on: {}, id: "", className: "", textContent: "", _html: "",
      classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(t, f) { this.on[t] = f; },
      append(...c) { this.children.push(...c); },
      appendChild(c) { this.children.push(c); if (c.id) byId[c.id] = c; return c; },
      querySelector(sel) { return sel === "button" ? this._btn : sel === ".dpc-toast-msg" ? this._msg : null; },
    };
    Object.defineProperty(el, "innerHTML", {
      get() { return this._html; },
      set(v) { this._html = v; this.children = []; if (v.includes("dpc-toast-msg")) { this._msg = make(); this._btn = make(); } },
    });
    return el;
  };
  const document = { createElement: make, getElementById: (id) => byId[id] || null, body: make(), head: make() };
  const env = {
    window: { addEventListener: (t, f) => { listeners[t] = f; } },
    navigator: { userAgent: "test", sendBeacon: (u) => { sent.push(u); return true; } },
    location: { pathname: "/calender/", reload() {} },
    document,
    fetch: async (u) => { sent.push(u); },
    Blob: class { constructor(parts) { this.parts = parts; } },
    console: { error: (...a) => logged.push(a) },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  const api = new Function(...Object.keys(env), readFileSync(ROOT + "errors.js", "utf8") + "\nreturn { DPC, DPC_ERRORS_URL };")(...Object.values(env));
  return { ...api, window: env.window, document, make, sent, logged, listeners, byId };
}

suite("Errors · messages on the page");

test("pages can reach it as window.DPC (a top-level const alone isn't on window)", () => {
  const P = fakePage();
  ok(P.window.DPC === P.DPC, "errors.js doesn't set window.DPC, so every window.DPC?.… call on the pages does nothing");
});

test("the alert URL is empty or a real Apps Script web app", () => {
  const u = fakePage().DPC_ERRORS_URL;
  ok(u === "" || /^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/.test(u), `odd DPC_ERRORS_URL: ${u}`);
});

test("with an alert URL, each distinct error is sent once", () => {
  const P = fakePage();
  if (!P.DPC_ERRORS_URL) return; // only meaningful once the URL is set
  P.DPC.report("Games: load", new Error("Failed to fetch"));
  P.DPC.report("Games: load", new Error("Failed to fetch"));
  eq(P.sent, [P.DPC_ERRORS_URL]);
});

test("a failed action shows one message bar, reused, with the text set safely", () => {
  const P = fakePage();
  P.DPC.toast("<img src=x onerror=alert(1)>");
  P.DPC.toast("Couldn't refresh your stats. Try again.");
  const bar = P.byId["dpc-toast"];
  ok(bar && bar.classList.contains("show"), "message bar not shown");
  eq(P.document.body.children.filter((c) => c.id === "dpc-toast").length, 1, "a second bar was added");
  eq(bar._msg.textContent, "Couldn't refresh your stats. Try again.");
  ok(!bar.innerHTML.includes("onerror"), "message text went into HTML");
  eq(bar.attrs.role, "alert");
});

test("a failed load shows the card with Try again, which retries", () => {
  const P = fakePage(), box = P.make();
  let retried = 0;
  P.DPC.loadError(box, { title: "Couldn't load games", onRetry: () => retried++ });
  const [title, body, btn] = box.children[0].children;
  eq([title.textContent, btn.textContent], ["Couldn't load games", "Try again"]);
  ok(body.textContent.startsWith("Check your connection"), body.textContent);
  btn.on.click();
  eq(retried, 1);
});

test("the message helpers never throw, even on a broken page", () => {
  const P = fakePage();
  P.document.createElement = () => { throw new Error("no DOM"); };
  P.DPC.toast("x");
  P.DPC.loadError(P.make(), {});
  P.DPC.loadError(null, {});
  P.DPC.report("where", new Error("boom"));
});

test("without an alert URL nothing is sent, but errors still reach the console", () => {
  const P = fakePage();
  if (P.DPC_ERRORS_URL) return; // only meaningful until the URL is set
  P.DPC.report("Games: load", new Error("Failed to fetch"));
  eq([P.sent.length, P.logged.length], [0, 1]);
});

test("an uncaught error is reported and the player told once; noise is ignored", () => {
  const P = fakePage();
  P.listeners.error({ message: "Script error.", filename: "" });
  eq(P.logged.length, 0, "noise was reported");
  P.listeners.error({ error: new Error("Cannot read properties of null"), filename: SITE_FILE });
  P.listeners.unhandledrejection({ reason: new TypeError("Failed to fetch") });
  eq(P.logged.length, 2);
  ok(P.byId["dpc-toast"]?._msg.textContent.startsWith("Something went wrong"), "the player wasn't told");
});

suite("Errors · every page loads errors.js first in <head>");

const pages = readdirSync(ROOT, { recursive: true })
  .map(String)
  .filter((p) => p.endsWith(".html") && !/^(\.git|node_modules|tests)\b/.test(p));

for (const f of pages) {
  test(f, () => {
    const depth = f.split("/").length - 1;
    const src = "../".repeat(depth) + "errors.js";
    const re = new RegExp(`<head>\\s*<script src="${src.replace(/[.]/g, "\\.")}\\?v=\\d+"></script>`);
    ok(re.test(readFileSync(ROOT + f, "utf8")), `${f} doesn't load ${src} first`);
  });
}
