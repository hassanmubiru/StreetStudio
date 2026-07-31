// Phase 5 — perf under load, against the running API on real infrastructure.
// Two parts:
//  (1) Sustained concurrent load on an authenticated read path across many
//      distinct clients (distinct bearer tokens → independent rate-limit keys),
//      measuring throughput and latency percentiles with zero rate-limit noise.
//  (2) A single-client burst that demonstrates rate-limiting sheds excess load
//      (R29.1): ~100 admitted, the rest rejected 429 with a retry-after hint.
const BASE = "http://localhost:8080";

async function req(method, path, { token } = {}) {
  const headers = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  const t0 = process.hrtime.bigint();
  const res = await fetch(BASE + path, { method, headers });
  await res.arrayBuffer();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { status: res.status, ms, retryAfter: res.headers.get("retry-after") };
}
const rand = () => Math.random().toString(36).slice(2, 10);

async function makeClient() {
  const email = `load_${rand()}@example.com`;
  await req("POST", "/auth/register").catch(() => {});
  // register/login need bodies; do them directly with fetch.
  await fetch(BASE + "/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "password12345", displayName: "L" }) });
  const login = await (await fetch(BASE + "/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "password12345" }) })).json();
  return login.accessToken;
}

function percentiles(samples) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  const sum = s.reduce((a, b) => a + b, 0);
  return { p50: at(50), p90: at(90), p95: at(95), p99: at(99), max: s[s.length - 1], mean: sum / s.length };
}

// Bounded-concurrency runner.
async function runPool(tasks, concurrency) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  });
  await Promise.all(workers);
  return results;
}

const CLIENTS = 30;
const PER_CLIENT = 90; // < 100/60s rate-limit budget per token
const CONCURRENCY = 50;

// Build the task list with a FRESH set of tokens per sub-test so each
// measurement starts with a clean per-client rate-limit budget.
async function loadTest(path, label) {
  const tokens = [];
  for (let k = 0; k < CLIENTS; k++) tokens.push(await makeClient());
  const tasks = [];
  for (let c = 0; c < CLIENTS; c++) {
    for (let n = 0; n < PER_CLIENT; n++) {
      const token = tokens[c];
      tasks.push(() => req("GET", path, { token }));
    }
  }
  for (let j = tasks.length - 1; j > 0; j--) { const r = Math.floor(Math.random() * (j + 1)); [tasks[j], tasks[r]] = [tasks[r], tasks[j]]; }
  return { tasks, total: tasks.length, path, label };
}

for (const { path, label } of [ { path: "/auth/me", label: "auth.currentMember (PK lookup)" }, { path: "/organizations", label: "organizations.list (JOIN)" } ]) {
  const { tasks, total } = await loadTest(path, label);
  const wall0 = Date.now();
  const results = await runPool(tasks, CONCURRENCY);
  const wallMs = Date.now() - wall0;
  const ok = results.filter((r) => r.status === 200);
  const codes = results.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
  const pct = percentiles(ok.map((r) => r.ms));
  console.log(`\n=== ${label}  (${total} reqs, ${CONCURRENCY} concurrent) ===`);
  console.log(`  wall: ${wallMs}ms  throughput: ${(total / (wallMs / 1000)).toFixed(0)} req/s`);
  console.log(`  status: ${JSON.stringify(codes)}`);
  console.log(`  latency ms  mean=${pct.mean.toFixed(1)} p50=${pct.p50.toFixed(1)} p90=${pct.p90.toFixed(1)} p95=${pct.p95.toFixed(1)} p99=${pct.p99.toFixed(1)} max=${pct.max.toFixed(1)}`);
}

// Part 2 — rate limiting under burst (R29.1) on a SINGLE fresh client.
console.log(`\n=== rate limiting under burst (single fresh client, 130 rapid reqs) ===`);
const burstToken = await makeClient();
const burst = await runPool(Array.from({ length: 130 }, () => () => req("GET", "/auth/me", { token: burstToken })), 20);
const bcodes = burst.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});
const limited = burst.filter((r) => r.status === 429);
console.log(`  status: ${JSON.stringify(bcodes)}`);
console.log(`  429s: ${limited.length}; retry-after sample: ${limited[0]?.retryAfter ?? "n/a"}`);
console.log(limited.length > 0 ? "  R29.1 OK: excess load shed with 429 + retry-after" : "  NOTE: no 429 (limit not reached in window)");
