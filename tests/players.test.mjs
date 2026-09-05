// Player data: onboarding self-rating floor + phone normalisation.
import { readFileSync } from "node:fs";
import { ROOT, loadFns, suite, test, ok, eq } from "./lib/harness.mjs";

const A = loadFns("Application/index.html", ["displaySelfRating"]);

suite("Application · self-rating floor (<1 → 1, 1–2.9 → 2, ≥3 as-is)");

test("anything under 1 floors to 1", () => {
  for (const r of [0, 0.1, 0.5, 0.99]) eq(A.displaySelfRating(r), "1", `r=${r}`);
});

test("1 up to just under 3 floors to 2", () => {
  for (const r of [1, 1.5, 2, 2.9, 2.99]) eq(A.displaySelfRating(r), "2", `r=${r}`);
});

test("3 and above shown as-is to one decimal", () => {
  eq(A.displaySelfRating(3), "3.0");
  eq(A.displaySelfRating(4.25), "4.3");
  eq(A.displaySelfRating(7), "7.0");
});

test("boundaries land on the right side", () => {
  eq(A.displaySelfRating(0.999), "1");
  eq(A.displaySelfRating(1), "2");
  eq(A.displaySelfRating(2.999), "2");
  eq(A.displaySelfRating(3), "3.0");
});

test("negative input still floors to 1, never a negative rating", () => {
  eq(A.displaySelfRating(-5), "1");
});

// ── phone normalisation, taken from the shipped dashboard expression ──
const dash = readFileSync(ROOT + "Dashboard/index.html", "utf8");
const m = dash.match(/const\s+ph10\s*=\s*([^;]+);/);
if (!m) throw new Error("players.test: ph10 normalisation expression not found in Dashboard/index.html");
const ph10 = new Function("phone", "return " + m[1] + ";");

suite("Dashboard · phone normalisation (last 10 digits)");

test("strips an Indian country code", () => eq(ph10("919810178983"), "9810178983"));
test("leaves a bare 10-digit number alone", () => eq(ph10("9810178983"), "9810178983"));

test("strips +, spaces and dashes", () => {
  for (const v of ["+91 98101 78983", "+91-98101-78983", " 91 9810178983 ", "(91) 9810178983"])
    eq(ph10(v), "9810178983", `failed for ${JSON.stringify(v)}`);
});

test("handles other country codes by taking the last 10", () => {
  eq(ph10("00919810178983"), "9810178983");
  eq(ph10("+1 9810178983"), "9810178983");
});

test("empty / null / undefined give an empty string, not a crash", () => {
  for (const v of ["", null, undefined]) eq(ph10(v), "", `failed for ${JSON.stringify(v)}`);
});

test("short numbers are returned whole (no padding, no throw)", () => {
  eq(ph10("12345"), "12345");
});

test("numeric input is accepted", () => eq(ph10(9810178983), "9810178983"));

test("two numbers sharing the last 10 digits normalise to the same key", () => {
  ok(ph10("919810178983") === ph10("9810178983"), "the Karan Sehgal case must collapse to one key");
});

// ── Application question numbering ────────────────────────
// Every VISIBLE question must be numbered 1..N with no gaps or duplicates,
// in both states (skill questions hidden for Beginner, shown for Int/Adv).
const app = readFileSync(ROOT + "Application/index.html", "utf8");
const labels = [...app.matchAll(/class="q-label"[^>]*>\s*(\d+)\s*—\s*([^<]+?)\s*</g)]
  .map(m => ({ n: +m[1], name: m[2] }));
const SKILL = ["Wall play", "Serve quality", "Smash ability", "Doubles coordination", "Return of serve"];
const TAIL  = ["Community", "Instagram", "Vision"];
const baseM = app.match(/const\s+base\s*=\s*isAdv\s*\?\s*(\d+)\s*:\s*(\d+)/);
if (!baseM) throw new Error("players.test: `const base = isAdv ? A : B` not found");
const [advBase, plainBase] = [+baseM[1], +baseM[2]];

/** Numbers a user actually sees, with the tail renumbered the way the code does. */
function visibleSequence(isAdv) {
  const base = isAdv ? advBase : plainBase;
  const seq = [];
  for (const l of labels) {
    if (SKILL.includes(l.name) && !isAdv) continue;      // hidden for Beginner
    if (TAIL.includes(l.name)) seq.push(base + TAIL.indexOf(l.name));
    else seq.push(l.n);
  }
  return seq;
}

suite("Application · question numbering is 1..N, no gaps or duplicates");

for (const isAdv of [false, true]) {
  const mode = isAdv ? "Intermediate/Advanced (skill questions shown)" : "Beginner (skill questions hidden)";
  test(`${mode}`, () => {
    const seq = visibleSequence(isAdv);
    const dupes = seq.filter((n, i) => seq.indexOf(n) !== i);
    ok(dupes.length === 0, `duplicate question numbers ${[...new Set(dupes)].join(", ")} in ${JSON.stringify(seq)}`);
    eq(seq, seq.map((_, i) => i + 1), `numbering should run 1..${seq.length}`);
  });
}
