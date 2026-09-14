// Tiny zero-dependency test harness + source extractor.
// Extracts named functions straight out of the app's .html/.js so tests run
// against the SHIPPED code, not a copy that can drift.
import { readFileSync } from "node:fs";

export const ROOT = new URL("../../", import.meta.url).pathname;

/** Pull `function name(...) {...}` out of a source file by brace matching. */
export function extractFns(file, names) {
  const src = readFileSync(ROOT + file, "utf8");
  let out = "";
  for (const name of names) {
    const start = src.search(new RegExp(`function\\s+${name}\\s*\\(`));
    if (start < 0) throw new Error(`extractFns: ${name} not found in ${file}`);
    let i = src.indexOf("{", start), depth = 0, end = -1;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
    }
    if (end < 0) throw new Error(`extractFns: unbalanced braces for ${name}`);
    out += src.slice(start, end) + "\n";
  }
  return out;
}

/** Evaluate extracted source with an optional preamble, return requested names. */
export function loadFns(file, names, preamble = "") {
  const body = preamble + "\n" + extractFns(file, names) + "\nreturn {" + names.join(",") + "};";
  return new Function(body)();
}

// ── runner ──
// Tests run one at a time in the order they're declared (async ones are awaited),
// so a test that stubs fetch or localStorage can't leak into the next one.
const results = [];
let current = "";
let queue = Promise.resolve();

export function suite(name) { current = name; }
export function test(name, fn) {
  const r = { suite: current, name, ok: true };
  results.push(r);
  queue = queue.then(async () => {
    try { await fn(); } catch (e) { r.ok = false; r.err = e.message; }
  });
}
export function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }
export function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || "not equal"} — got ${A}, want ${B}`);
}
export async function rejects(promise, re, msg) {
  try { await promise; } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`${msg || "wrong error"} — got "${e.message}"`);
    return;
  }
  throw new Error(msg || "expected it to fail");
}

export async function report() {
  await queue;
  const bySuite = new Map();
  for (const r of results) {
    if (!bySuite.has(r.suite)) bySuite.set(r.suite, []);
    bySuite.get(r.suite).push(r);
  }
  let pass = 0, fail = 0;
  for (const [s, rs] of bySuite) {
    const bad = rs.filter(r => !r.ok);
    pass += rs.length - bad.length; fail += bad.length;
    console.log(`\n${bad.length ? "✗" : "✓"} ${s}  (${rs.length - bad.length}/${rs.length})`);
    for (const b of bad) console.log(`   ✗ ${b.name}\n     ${b.err}`);
  }
  console.log(`\n${"─".repeat(60)}\n${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  return { pass, fail };
}
