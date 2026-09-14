// Application form: the self-rating pieces, and guards against the two things that
// lost applications (Sep 8–14, 2026).
import { readFileSync } from "node:fs";
import { ROOT, loadFns, suite, test, ok, eq } from "./lib/harness.mjs";

const src = readFileSync(ROOT + "Application/index.html", "utf8");
const A = loadFns("Application/index.html", ["expBase", "racquetBonus", "levelCeiling", "playtomicGroup"],
  "var document = { querySelector: () => (globalThis.__racquet ? { value: globalThis.__racquet } : null) };");

suite("Application · self-rating pieces");

test("experience sets the starting point", () => {
  eq(["Never played", "0-3 months", "3-12 months", "1+ years", ""].map(A.expBase), [0, 0.5, 1, 1.5, 0.5]);
});
test("racquet-sport background adds a bonus", () => {
  try {
    const bonus = (v) => { globalThis.__racquet = v; return A.racquetBonus(); };
    eq([bonus("Competitive"), bonus("Casual"), bonus("")], [0.5, 0.25, 0]);
  } finally { delete globalThis.__racquet; }
});
test("each level has a ceiling", () => eq(["Advanced", "Intermediate", "Beginner"].map(A.levelCeiling), [6, 4.5, 2]));
test("score to group, at every boundary", () => {
  eq([1, 1.5, 2, 2.5, 3.5, 4, 4.5, 5, 6, 6.5].map((s) => A.playtomicGroup(s).label),
    ["Beginner", "Initiation", "Initiation", "Lower Intermediate", "Lower Intermediate", "Intermediate", "Intermediate", "Upper Intermediate", "Advanced", "Elite"]);
});

suite("Application · saving");

test("not pointed at the Sep 8 deployment that never saved", () => {
  ok(!src.includes("AKfycbyGmWAGkViQGosTFi-aq0rg1Zy8MrHUwGvH0XEJYdsZeqnpZv3ugk7f-BII8Wvqz9bXPw"), "SCRIPT_URL is the broken deployment again");
});
test("only a {ok:true} reply counts as saved", () => ok(/data\.ok\s*!==\s*true/.test(src), "the submit handler no longer checks for ok:true"));
test("a failed save is reported", () => ok(src.includes('window.DPC?.report("Application: submit"'), "submit failures aren't reported"));
