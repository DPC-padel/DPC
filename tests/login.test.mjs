// Login: staying signed in, "not registered" answers, and what players see when
// the server can't be reached.
import { readFileSync } from "node:fs";
import { ROOT, extractFns, suite, test, ok, eq } from "./lib/harness.mjs";

const src = readFileSync(ROOT + "login/index.html", "utf8");
const consts = ["SESSION_KEY", "SESSION_PHONE_KEY", "SESSION_SAVED_AT_KEY", "SESSION_TTL"].map((k) => {
  const m = src.match(new RegExp(`const\\s+${k}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`login.test: ${k} not found in login/index.html`);
  return `const ${k} = ${m[1]};`;
}).join("\n");

function login() {
  const store = new Map(), reports = [];
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const window = { DPC: { report: (where, e) => reports.push([where, e.message]) } };
  const fns = new Function("localStorage", "window", consts + "\n" +
    extractFns("login/index.html", ["isMissingPlayerError", "clearStoredSession", "hasValidSession", "friendlyError"]) +
    "\nreturn { isMissingPlayerError, hasValidSession, friendlyError, SESSION_TTL };")(localStorage, window);
  return { ...fns, store, reports };
}
const DAY = 24 * 60 * 60 * 1000;
const signIn = (L, ageMs) => {
  L.store.set("dpcPlayerSession", "{}");
  L.store.set("dpcPlayerPhone", "9000000001");
  L.store.set("dpcPlayerSessionSavedAt", String(Date.now() - ageMs));
};

suite("Login · 'not registered' answers");

test("recognises the server's not-registered wording", () => {
  const L = login();
  for (const m of ["This number is not in our system. Please apply to join.", "Player not found"]) ok(L.isMissingPlayerError(m), m);
});
test("a wrong password or a network failure isn't 'not registered'", () => {
  const L = login();
  for (const m of ["Incorrect password.", "Failed to fetch", "", null]) ok(!L.isMissingPlayerError(m), String(m));
});

suite("Login · staying signed in");

test("no saved session means signed out", () => eq(login().hasValidSession(), false));
test("visited 10 days ago: still signed in, and the clock restarts", () => {
  const L = login();
  signIn(L, 10 * DAY);
  ok(L.hasValidSession(), "should still be signed in");
  ok(Date.now() - Number(L.store.get("dpcPlayerSessionSavedAt")) < 5000, "last-visit time wasn't refreshed");
});
test("away longer than the limit: signed out and the session cleared", () => {
  const L = login();
  signIn(L, L.SESSION_TTL + DAY);
  eq([L.hasValidSession(), L.store.size], [false, 0]);
});
test("a half-saved session is cleared", () => {
  const L = login();
  L.store.set("dpcPlayerPhone", "9000000001");
  eq([L.hasValidSession(), L.store.size], [false, 0]);
});

suite("Login · when something goes wrong");

test("the server's own answer is shown as-is and not reported", () => {
  const L = login();
  eq(L.friendlyError(Object.assign(new Error("Incorrect password."), { fromServer: true }), "Login"), "Incorrect password.");
  eq(L.reports.length, 0);
});
test("a network or parsing failure gets a plain message and is reported", () => {
  const L = login();
  eq(L.friendlyError(new TypeError("Failed to fetch"), "Login"), "Couldn't reach the server. Check your connection and try again.");
  eq(L.reports, [["Login", "Failed to fetch"]]);
});
test("login, register and password reset all use it", () => {
  for (const [id, where] of [["loginError", "Login"], ["registerError", "Register"], ["forgotError", "Reset password"]])
    ok(src.includes(`showAlert('${id}', friendlyError(e, '${where}'))`), `${id} still shows raw error text`);
});
