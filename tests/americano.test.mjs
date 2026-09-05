// Americano scheduler — exhaustive over the whole domain the UI allows.
// UI limits: players 4..24 (pMinus/pPlus), courts 1..floor(P/4) (clampCourts).
import { loadFns, suite, test, ok, eq } from "./lib/harness.mjs";

const S = loadFns("Dashboard/americano.html",
  ["buildSchedule", "factorPairs", "buildFull", "buildGreedy", "greedyPairs", "greedyMatches"]);

const REPEATS = 25;                    // greedy uses Math.random → run many times
const domain = [];
for (let P = 4; P <= 24; P++)
  for (let C = 1; C <= Math.floor(P / 4); C++) domain.push([P, C]);

/** Analyse one generated schedule. */
function analyse(sched, P, perRound) {
  const games = new Array(P).fill(0);
  const partner = new Map(), oppo = new Map();
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  let malformed = null;

  sched.forEach((rd, ri) => {
    const seen = new Set();
    for (const m of rd.matches) {
      if (!m.teamA || !m.teamB || m.teamA.length !== 2 || m.teamB.length !== 2)
        malformed = `round ${ri}: team not size 2 (${JSON.stringify(m)})`;
      for (const p of [...m.teamA, ...m.teamB]) {
        if (p === undefined || p === null || Number.isNaN(p)) malformed = `round ${ri}: undefined player`;
        if (seen.has(p)) malformed = `round ${ri}: player ${p} appears twice`;
        seen.add(p); games[p]++;
      }
      for (const t of [m.teamA, m.teamB]) partner.set(key(...t), (partner.get(key(...t)) || 0) + 1);
      for (const a of m.teamA) for (const b of m.teamB) oppo.set(key(a, b), (oppo.get(key(a, b)) || 0) + 1);
    }
    // resting must be exactly the players not on court, no overlap
    const rest = new Set(rd.resting || []);
    if (seen.size !== perRound) malformed = `round ${ri}: ${seen.size} active, expected ${perRound}`;
    for (const r of rest) if (seen.has(r)) malformed = `round ${ri}: ${r} both resting and playing`;
    if (seen.size + rest.size !== P) malformed = `round ${ri}: active+resting=${seen.size + rest.size} != ${P}`;
  });

  const partnerRepeats = [...partner.values()].filter(v => v > 1).length;
  const maxOppo = Math.max(0, ...oppo.values());
  return { games, partnerRepeats, maxOppo, malformed,
           spread: Math.max(...games) - Math.min(...games) };
}

suite("Americano · structural integrity (all P×C, ×25 runs)");

for (const [P, C] of domain) {
  const perRound = Math.min(C * 4, P - (P % 4));
  test(`${P}p/${C}c · well-formed rounds`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const sched = S.buildSchedule(P, C);
      const a = analyse(sched, P, perRound);
      ok(!a.malformed, a.malformed);
      eq(sched.length, P - 1, `${P}p/${C}c round count`);
    }
  });
}

suite("Americano · unique partners when everyone plays (P%4==0, enough courts)");

for (const [P, C] of domain) {
  const perRound = Math.min(C * 4, P - (P % 4));
  if (!(perRound === P && P % 4 === 0)) continue;
  test(`${P}p/${C}c · zero partner repeats + every pair partners once`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const a = analyse(S.buildSchedule(P, C), P, perRound);
      eq(a.partnerRepeats, 0, `${P}p/${C}c partner repeats`);
      eq(a.spread, 0, `${P}p/${C}c games spread (everyone plays every round)`);
    }
  });
  test(`${P}p/${C}c · opponents meet at most twice`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const a = analyse(S.buildSchedule(P, C), P, perRound);
      ok(a.maxOppo <= 2, `${P}p/${C}c max opponent meets = ${a.maxOppo} (want <=2)`);
    }
  });
}

suite("Americano · fairness when players rest (rotation)");

for (const [P, C] of domain) {
  const perRound = Math.min(C * 4, P - (P % 4));
  if (perRound === P && P % 4 === 0) continue;          // covered above
  test(`${P}p/${C}c · games played differ by at most 1`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const a = analyse(S.buildSchedule(P, C), P, perRound);
      ok(a.spread <= 1, `${P}p/${C}c games spread = ${a.spread} (min ${Math.min(...a.games)}, max ${Math.max(...a.games)})`);
    }
  });
  test(`${P}p/${C}c · no repeated partners`, () => {
    for (let i = 0; i < REPEATS; i++) {
      const a = analyse(S.buildSchedule(P, C), P, perRound);
      eq(a.partnerRepeats, 0, `${P}p/${C}c partner repeats`);
    }
  });
}

suite("Americano · circle method (factorPairs)");

test("produces P-1 rounds of P/2 pairs for even P", () => {
  for (const P of [4, 6, 8, 10, 12, 16, 20, 24]) {
    const rounds = S.factorPairs(P);
    eq(rounds.length, P - 1, `factorPairs(${P}) rounds`);
    for (const r of rounds) eq(r.length, P / 2, `factorPairs(${P}) pairs per round`);
  }
});

test("every pair partners exactly once (perfect 1-factorization)", () => {
  for (const P of [4, 8, 12, 16, 20, 24]) {
    const seen = new Map();
    for (const r of S.factorPairs(P)) for (const [a, b] of r) {
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    eq(seen.size, (P * (P - 1)) / 2, `factorPairs(${P}) distinct pairs`);
    ok([...seen.values()].every(v => v === 1), `factorPairs(${P}) each pair exactly once`);
  }
});

test("each player appears exactly once per round", () => {
  for (const P of [6, 10, 12, 24]) {
    for (const r of S.factorPairs(P)) {
      const flat = r.flat();
      eq(new Set(flat).size, P, `factorPairs(${P}) player coverage per round`);
    }
  }
});

suite("Americano · defensive edge cases");

test("P below a full court does not hang or emit broken matches", () => {
  for (const P of [0, 1, 2, 3]) {
    const sched = S.buildSchedule(P, 1);
    ok(Array.isArray(sched), `buildSchedule(${P},1) returns an array`);
    for (const rd of sched) for (const m of rd.matches) {
      for (const p of [...m.teamA, ...m.teamB]) ok(p !== undefined, `P=${P} produced an undefined player`);
    }
  }
});

test("courts beyond floor(P/4) clamp to available players", () => {
  for (const [P, C] of [[6, 5], [7, 9], [5, 3], [9, 4]]) {
    const sched = S.buildSchedule(P, C);
    const perRound = Math.min(C * 4, P - (P % 4));
    for (const rd of sched) {
      const active = rd.matches.flatMap(m => [...m.teamA, ...m.teamB]);
      eq(active.length, perRound, `P=${P} C=${C} active per round`);
      eq(new Set(active).size, active.length, `P=${P} C=${C} no duplicate player`);
    }
  }
});
