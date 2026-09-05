// Coaching: per-type pricing + per-slot capacity rules.
import { readFileSync } from "node:fs";
import { ROOT, loadFns, suite, test, ok, eq } from "./lib/harness.mjs";

// config.js is plain JS with no top-level DOM use → evaluate it whole.
const cfg = new Function(
  readFileSync(ROOT + "coaching/config.js", "utf8") +
  "\nreturn { SESSION_TYPES, sharePrice, typeTotal, typePrice };"
)();

suite("Coaching · sharePrice (legacy single-price split)");

test("splits a session total across players", () => {
  eq(cfg.sharePrice(3900, "1:2"), 1950);
  eq(cfg.sharePrice(3400, "1:1"), 3400);
  eq(cfg.sharePrice(4400, "1:3"), 1467);          // 1466.67 rounds up
});
test("zero total stays zero", () => eq(cfg.sharePrice(0, "1:3"), 0));

suite("Coaching · typeTotal (per-type sheet columns)");

test("reads the canonical session_priceX:Y key", () => {
  const c = { "session_price1:1": 3400, "session_price1:2": 3900, "session_price1:3": 4400 };
  eq(cfg.typeTotal(c, "1:1"), 3400);
  eq(cfg.typeTotal(c, "1:2"), 3900);
  eq(cfg.typeTotal(c, "1:3"), 4400);
});

test("accepts the underscore and no-colon header variants", () => {
  eq(cfg.typeTotal({ "session_price_1_2": 3900 }, "1:2"), 3900);
  eq(cfg.typeTotal({ "session_price12": 3900 }, "1:2"), 3900);
  eq(cfg.typeTotal({ "price1:2": 3900 }, "1:2"), 3900);
});

test("falls back to the single session_price when the per-type cell is empty", () => {
  eq(cfg.typeTotal({ session_price: 3600, "session_price1:2": "" }, "1:2"), 3600);
  eq(cfg.typeTotal({ session_price: 3600, "session_price1:2": 0 }, "1:2"), 3600);
  eq(cfg.typeTotal({ session_price: 3600 }, "1:3"), 3600);
});

test("string numbers from the sheet are coerced", () => {
  eq(cfg.typeTotal({ "session_price1:2": "3900" }, "1:2"), 3900);
});

test("missing coach or all-empty pricing yields 0, never NaN", () => {
  eq(cfg.typeTotal(null, "1:2"), 0);
  eq(cfg.typeTotal({}, "1:2"), 0);
  ok(!Number.isNaN(cfg.typeTotal({ session_price: "abc" }, "1:2")), "NaN leaked from a junk price");
});

suite("Coaching · typePrice (what each player pays)");

test("your share = total / players, matching the agreed numbers", () => {
  const c = { "session_price1:1": 3400, "session_price1:2": 3900, "session_price1:3": 4400 };
  eq(cfg.typePrice(c, "1:1"), 3400);
  eq(cfg.typePrice(c, "1:2"), 1950);
  eq(cfg.typePrice(c, "1:3"), 1467);
});

test("a 1:3 total of 4200 splits three ways (not two)", () => {
  eq(cfg.typePrice({ "session_price1:3": 4200 }, "1:3"), 1400);
});

test("unknown type id does not divide by zero", () => {
  const v = cfg.typePrice({ session_price: 1000 }, "1:9");
  ok(Number.isFinite(v), `expected finite, got ${v}`);
});

// ── capacity ──────────────────────────────────────────────
// Rebuild the capacity fns with a mutable S we control.
function capacity(slots) {
  const fns = loadFns(
    "coaching/index.html",
    ["slotLoad", "typeAvail", "slotNoTrio"],
    "var SESSION_TYPES = " + JSON.stringify(cfg.SESSION_TYPES) + ";" +
    "var S = { slots: " + JSON.stringify(slots) + " };"
  );
  return (id) => fns.typeAvail(id);
}

suite("Coaching · slot capacity (1:1 exclusive, 1:2 caps at 2, 1:3 caps at 3)");

test("empty slot — everything open", () => {
  const a = capacity([{ signups: 0 }]);
  eq(a("1:1"), { avail: true, left: 1 });
  eq(a("1:2"), { avail: true, left: 2 });
  eq(a("1:3"), { avail: true, left: 3 });
});

test("one player in — 1:1 closes, 1:2 has 1 left, 1:3 has 2 left", () => {
  const a = capacity([{ signups: 1 }]);
  eq(a("1:1").avail, false);
  eq(a("1:2"), { avail: true, left: 1 });
  eq(a("1:3"), { avail: true, left: 2 });
});

test("two players in — 1:2 sold out, 1:3 has 1 left", () => {
  const a = capacity([{ signups: 2 }]);
  eq(a("1:1").avail, false);
  eq(a("1:2"), { avail: false, left: 0 });
  eq(a("1:3"), { avail: true, left: 1 });
});

test("three players in — slot is full for every type", () => {
  const a = capacity([{ signups: 3 }]);
  for (const t of ["1:1", "1:2", "1:3"]) eq(a(t).avail, false, `${t} should be closed`);
});

test("a private booking locks the whole slot", () => {
  const a = capacity([{ signups: 1, has_private: true }]);
  for (const t of ["1:1", "1:2", "1:3"]) eq(a(t).avail, false, `${t} should be locked by private`);
});

test("no_trio closes 1:3 but leaves 1:2 open", () => {
  const a = capacity([{ signups: 1, no_trio: true }]);
  eq(a("1:3"), { avail: false, left: 0 });
  eq(a("1:2"), { avail: true, left: 1 });
});

test("multi-slot booking uses the worst-case (busiest) slot", () => {
  const a = capacity([{ signups: 0 }, { signups: 2 }]);
  eq(a("1:2").avail, false, "should respect the fuller slot");
  eq(a("1:3"), { avail: true, left: 1 });
});

test("a private on ANY picked slot locks the booking", () => {
  const a = capacity([{ signups: 0 }, { signups: 1, has_private: true }]);
  eq(a("1:2").avail, false);
});

test("never reports negative spots left", () => {
  for (const n of [4, 5, 99]) {
    const a = capacity([{ signups: n }]);
    for (const t of ["1:1", "1:2", "1:3"]) ok(a(t).left >= 0, `${t} at signups=${n} gave ${a(t).left}`);
  }
});

test("missing/garbage signups is treated as empty, not NaN", () => {
  for (const s of [{}, { signups: null }, { signups: "abc" }, { signups: undefined }]) {
    const a = capacity([s]);
    ok(!Number.isNaN(a("1:2").left), `NaN left for ${JSON.stringify(s)}`);
    eq(a("1:2").left, 2, `expected a free slot for ${JSON.stringify(s)}`);
  }
});
