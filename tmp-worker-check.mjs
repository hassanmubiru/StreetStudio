const BASE = "http://localhost:8080";
const ctx = JSON.parse((await import("node:fs")).readFileSync("/tmp/worker-ctx.json", "utf8"));
const H = { authorization: `Bearer ${ctx.token}`, "x-organization-id": ctx.orgId };
const vid = ctx.videoIds[0];

const man = await (await fetch(`${BASE}/videos/${vid}/playback`, { headers: H })).json();
console.log("manifest status:", man.status, "renditions:", man.renditions.length, "assets:", man.assets.map(a => a.type).join(","));

// HEAD each rendition object through the authorized object stream to prove the
// bytes exist in MinIO and are non-empty.
let ok = true;
for (const r of man.renditions) {
  const res = await fetch(`${BASE}/objects/${r.objectKey}`, { method: "HEAD", headers: H });
  const len = res.headers.get("content-length");
  console.log(`  ${r.quality} ${r.objectKey} -> ${res.status} bytes=${len}`);
  if (res.status !== 200 || !(Number(len) > 0)) ok = false;
}
for (const a of man.assets) {
  const res = await fetch(`${BASE}/objects/${a.objectKey}`, { method: "HEAD", headers: H });
  const len = res.headers.get("content-length");
  console.log(`  ${a.type} ${a.objectKey} -> ${res.status} bytes=${len}`);
  if (res.status !== 200 || !(Number(len) > 0)) ok = false;
}
console.log(ok && man.status === "ready" && man.renditions.length === 3 ? "\nPASS: worker-produced derivatives present & non-empty in MinIO" : "\nFAIL");
process.exit(ok && man.status === "ready" && man.renditions.length === 3 ? 0 : 1);
