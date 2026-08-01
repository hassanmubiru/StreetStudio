// Drive the REAL @streetstudio/sdk typed client against the running API on real
// infrastructure — validating API/SDK parity end-to-end (not an in-memory fake).
import { StreetStudioClient } from "@streetstudio/sdk";

const BASE = "http://localhost:8080";
const rand = () => Math.random().toString(36).slice(2, 10);
const results = [];
const check = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  (" + detail + ")" : ""}`); };

// 1) Unauthenticated client: register + login via the SDK.
const anon = new StreetStudioClient({ baseUrl: BASE });
const email = `sdk_${rand()}@example.com`;
const member = await anon.auth.register({ email, password: "password12345" });
check("sdk auth.register → MemberDto", member && member.email === email, member?.id);

const session = await anon.auth.login({ email, password: "password12345" });
// The server returns an access-token payload; extract the bearer token.
const token = session.accessToken ?? session.token;
check("sdk auth.login → access token", typeof token === "string" && token.length > 20);

// 2) Authenticated client (bearer). currentMember round-trips through the SDK.
const authed = new StreetStudioClient({ baseUrl: BASE, auth: { kind: "bearer", token } });
const me = await authed.auth.currentMember();
check("sdk auth.currentMember", me && me.id === member.id, me?.email);

// 3) Organization create/list via SDK.
const org = await authed.organizations.create({ name: "SDK Org " + rand() });
check("sdk organizations.create", org && typeof org.id === "string", org?.name);
const orgs = await authed.organizations.list();
check("sdk organizations.list contains new org", orgs.some((o) => o.id === org.id), `count=${orgs.length}`);

// 4) Org-scoped client: full Projects CRUD through the SDK (RBAC + tenant scope
//    applied via the X-Organization-Id header the SDK sends).
const c = new StreetStudioClient({ baseUrl: BASE, auth: { kind: "bearer", token }, organizationId: org.id });

const project = await c.projects.create({ name: "Alpha" });
check("sdk projects.create", project && project.name === "Alpha", project?.id);
let list = await c.projects.list();
check("sdk projects.list (1)", list.length === 1 && list[0].id === project.id, `count=${list.length}`);
const got = await c.projects.get(project.id);
check("sdk projects.get", got.id === project.id);
const renamed = await c.projects.update(project.id, { name: "Beta" });
check("sdk projects.update (rename)", renamed.name === "Beta");
await c.projects.delete(project.id);
check("sdk projects.delete", true);
list = await c.projects.list();
check("sdk projects.list empty after delete", list.length === 0, `count=${list.length}`);

// 5) Folders: create a project, then a top-level folder, get + list via SDK.
const proj2 = await c.projects.create({ name: "WithFolders" });
const folder = await c.folders.create({ projectId: proj2.id, name: "Root Folder" });
check("sdk folders.create", folder && folder.name === "Root Folder", `depth=${folder.depth}`);
const folders = await c.folders.listByProject(proj2.id);
check("sdk folders.listByProject (1)", folders.length === 1 && folders[0].id === folder.id, `count=${folders.length}`);
await c.folders.delete(folder.id);
check("sdk folders.delete", true);

// 6) Read paths: videos.list (empty), notifications.list, analytics.metrics.
const vids = await c.videos.list();
check("sdk videos.list (empty)", Array.isArray(vids) && vids.length === 0, `count=${vids.length}`);
const notes = await authed.notifications.list();
check("sdk notifications.list", Array.isArray(notes), `count=${notes.length}`);
const metrics = await c.analytics.metrics();
check("sdk analytics.metrics (zeroed)", metrics && metrics.totalViews === 0, JSON.stringify(metrics));

// 7) API keys: create (secret revealed once) → list (no secret) → revoke.
const key = await c.apiKeys.create({ name: "ci-key", permissions: ["video:read"] });
check("sdk apiKeys.create reveals secret once", !!key.secret && !!key.apiKey?.id, key.apiKey?.name);
const keys = await c.apiKeys.list();
check("sdk apiKeys.list (metadata only, no secret)", keys.some((k) => k.id === key.apiKey.id) && keys.every((k) => !("secret" in k)), `count=${keys.length}`);
await c.apiKeys.revoke(key.apiKey.id);
check("sdk apiKeys.revoke", true);

// 8) Webhooks CRUD via SDK.
const wh = await c.webhooks.create({ eventType: "video.ready", url: "https://example.com/hook" });
check("sdk webhooks.create", wh && wh.eventType === "video.ready", wh?.id);
const whs = await c.webhooks.list();
check("sdk webhooks.list", whs.some((w) => w.id === wh.id), `count=${whs.length}`);
await c.webhooks.delete(wh.id);
check("sdk webhooks.delete", true);

// 9) Tenant isolation via the SDK: a second tenant cannot list tenant-A's projects.
const emailB = `sdk_${rand()}@example.com`;
await anon.auth.register({ email: emailB, password: "password12345" });
const sessB = await anon.auth.login({ email: emailB, password: "password12345" });
const cB = new StreetStudioClient({ baseUrl: BASE, auth: { kind: "bearer", token: sessB.accessToken }, organizationId: org.id });
console.log("  cross-tenant inputs:", JSON.stringify({ orgId: org.id, tokenLen: sessB?.accessToken?.length ?? null }));
let denied = false;
let crossOutcome;
try {
  const r = await cB.projects.list();
  crossOutcome = `RETURNED array len=${Array.isArray(r) ? r.length : "?"} value=${JSON.stringify(r).slice(0, 120)}`;
} catch (e) {
  denied = true;
  crossOutcome = `THREW code=${e?.code} status=${e?.status} name=${e?.name} msg=${String(e?.message).slice(0, 80)}`;
}
console.log("  cross-tenant outcome:", crossOutcome);
check("sdk cross-tenant projects.list → denied", denied);

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} SDK checks passed`);
process.exit(passed === results.length ? 0 : 1);
