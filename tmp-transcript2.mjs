const BASE = "http://localhost:8080";
const ctx = JSON.parse((await import("node:fs")).readFileSync("/tmp/tt-ctx.json", "utf8"));

async function j(method, path, { token, org } = {}) {
  const headers = {};
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (org) headers["x-organization-id"] = org;
  const res = await fetch(BASE + path, { method, headers });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const V = ctx.videoId;
const phase = process.argv[2] ?? "before";
const results = [];
const check = (name, got, want) => {
  const pass = got === want;
  results.push({ name, pass, got, want });
};

if (phase === "before") {
  check("transcript 404 when none exists", (await j("GET", `/videos/${V}/transcript`, { token: ctx.token, org: ctx.orgId })).status, 404);
  check("summary 404 when none exists", (await j("GET", `/videos/${V}/summary`, { token: ctx.token, org: ctx.orgId })).status, 404);
  check("transcript 404 for missing video", (await j("GET", `/videos/${crypto.randomUUID()}/transcript`, { token: ctx.token, org: ctx.orgId })).status, 404);
  check("transcript 401 without token", (await j("GET", `/videos/${V}/transcript`, { org: ctx.orgId })).status, 401);
  check("transcript 404 for foreign org", (await j("GET", `/videos/${V}/transcript`, { token: ctx.B.token, org: ctx.B.orgId })).status, 404);
  check("summary 404 for foreign org", (await j("GET", `/videos/${V}/summary`, { token: ctx.B.token, org: ctx.B.orgId })).status, 404);
} else {
  const t = await j("GET", `/videos/${V}/transcript`, { token: ctx.token, org: ctx.orgId });
  check("transcript 200 after seed", t.status, 200);
  check("transcript has 2 segments", Array.isArray(t.data?.segments) && t.data.segments.length, 2);
  check("transcript videoId matches", t.data?.videoId, V);
  check("transcript first segment text", t.data?.segments?.[0]?.text, "hello world");
  check("transcript indexedAt present", typeof t.data?.indexedAt === "string", true);
  const s = await j("GET", `/videos/${V}/summary`, { token: ctx.token, org: ctx.orgId });
  check("summary 200 after seed", s.status, 200);
  check("summary body matches", s.data?.body, "A concise summary.");
  check("summary videoId matches", s.data?.videoId, V);
  check("summary 404 foreign org after seed", (await j("GET", `/videos/${V}/summary`, { token: ctx.B.token, org: ctx.B.orgId })).status, 404);
  console.log("transcript body:", JSON.stringify(t.data));
  console.log("summary body:", JSON.stringify(s.data));
}

let allPass = true;
for (const r of results) {
  if (!r.pass) allPass = false;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  (got=${r.got}, want=${r.want})`);
}
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);
