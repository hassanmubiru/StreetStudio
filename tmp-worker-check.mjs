const BASE = "http://localhost:8080";
const ctx = JSON.parse((await import("node:fs")).readFileSync("/tmp/worker-ctx.json", "utf8"));
const H = { authorization: `Bearer ${ctx.token}`, "x-organization-id": ctx.orgId };
const vid = ctx.videoIds[0];

const man = await (await fetch(`${BASE}/videos/${vid}/playback`, { headers: H })).json();
console.log("manifest status:", man.status, "renditions:", man.renditions.length, "assets:", man.assets.map(a => a.type).join(","));

// HEAD each rendition object through the authorized object stream to prove the
// bytes exist in MinIO and are non-empty.
let ok = true;
async function probe(objectKey) {
  // Range GET first byte to confirm the object exists & has non-zero total.
  const res = await fetch(`${BASE}/objects/${objectKey}`, { headers: { ...H, range: "bytes=0-0" } });
  const cr = res.headers.get("content-range"); // e.g. "bytes 0-0/857123"
  const total = cr ? Number(cr.split("/")[1]) : 0;
  return { status: res.status, total };
}
for (const r of man.renditions) {
  const { status, total } = await probe(r.objectKey);
  console.log(`  ${r.quality} ${r.objectKey} -> ${status} total=${total}`);
  if ((status !== 206 && status !== 200) || !(total > 0)) ok = false;
}
for (const a of man.assets) {
  const { status, total } = await probe(a.objectKey);
  console.log(`  ${a.type} ${a.objectKey} -> ${status} total=${total}`);
  if ((status !== 206 && status !== 200) || !(total > 0)) ok = false;
}
console.log(ok && man.status === "ready" && man.renditions.length === 3 ? "\nPASS: worker-produced derivatives present & non-empty in MinIO" : "\nFAIL");
process.exit(ok && man.status === "ready" && man.renditions.length === 3 ? 0 : 1);
