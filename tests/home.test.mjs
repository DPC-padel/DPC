// Home page: the Dashboard button shows only for a signed-in player, and the home
// page must not sign people out sooner than login and the dashboard do.
import { readFileSync } from "node:fs";
import { ROOT, extractFns, suite, test, ok, eq } from "./lib/harness.mjs";

const DAY = 24 * 60 * 60 * 1000;
const constFrom = (file, name) => {
  const m = readFileSync(ROOT + file, "utf8").match(new RegExp(`${name}\\s*=\\s*([^;,]+)[;,]`));
  if (!m) throw new Error(`home.test: ${name} not found in ${file}`);
  return m[1];
};
const ttlDays = (file) => Math.round(new Function("return " + constFrom(file, "SESSION_TTL"))() / DAY);

function home() {
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const pre = ["SESSION_KEY", "SESSION_PHONE_KEY", "SESSION_SAVED_AT_KEY", "SESSION_TTL"].map((k) => `const ${k} = ${constFrom("index.html", k)};`).join("\n");
  const fns = new Function("localStorage", pre + "\n" + extractFns("index.html", ["hasValidDashboardSession"]) + "\nreturn { hasValidDashboardSession };")(localStorage);
  return { ...fns, store };
}

suite("Home · Dashboard button");

test("no session: no Dashboard button", () => eq(home().hasValidDashboardSession(), false));
test("signed in yesterday: Dashboard button", () => {
  const h = home();
  h.store.set("dpcPlayerSession", "{}");
  h.store.set("dpcPlayerPhone", "9000000001");
  h.store.set("dpcPlayerSessionSavedAt", String(Date.now() - DAY));
  ok(h.hasValidDashboardSession());
});

suite("Home · doesn't sign players out early");

test("home page allows as long a session as login", () => {
  eq(ttlDays("index.html"), ttlDays("login/index.html"),
    "home page session length (days) differs from login — opening the home page deletes sessions the dashboard still accepts");
});
test("dashboard allows as long a session as login", () => eq(ttlDays("Dashboard/index.html"), ttlDays("login/index.html")));
