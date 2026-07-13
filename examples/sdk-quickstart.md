# SDK quickstart

An end-to-end walkthrough using the official `@streetstudio/sdk` client. It maps
one-to-one to the public operation catalog (`apps/api/src/http/operations.ts`),
so everything here is reachable by any API consumer — no UI required.

## Install

```bash
npm install @streetstudio/sdk
```

## Create a client

```ts
import { StreetStudioClient } from "@streetstudio/sdk";

const client = new StreetStudioClient({
  baseUrl: "https://studio.example.com",
  // getToken/getApiKey are wired into the Authorization header on every request.
});
```

## 1. Register and sign in

```ts
await client.auth.register({ email: "dev@example.com", password: "correct horse battery staple" });

const session = await client.auth.login({
  email: "dev@example.com",
  password: "correct horse battery staple",
});
// Supply `session.token` to the client (via the token provider) for subsequent calls.

const me = await client.auth.currentMember();
```

## 2. Create an organization and a project

```ts
const org = await client.organizations.create({ name: "Platform Team" });

const project = await client.projects.create({
  organizationId: org.id,
  name: "Onboarding Recordings",
});
```

## 3. Upload a recording (chunked + resumable)

```ts
// Open a chunked upload session, then push ordered chunks (1 MB – 100 MB each).
const upload = await client.uploads.create({
  projectId: project.id,
  filename: "architecture-walkthrough.webm",
  sizeBytes: totalBytes,
});

// Each chunk is acknowledged; an interrupted upload resumes from the last ack.
// (Chunk transfer uses the upload session id returned above.)

const finished = await client.uploads.complete(upload.id);
// `finished` references the created Video; the processing pipeline runs next
// (thumbnail, preview, ABR renditions) and marks the Video `ready`.
```

## 4. Play it back

```ts
const video = await client.videos.get(finished.videoId);

if (video.status === "ready") {
  const manifest = await client.playback.manifest(video.id); // ABR streaming manifest
  await client.playback.recordView(video.id);
}
// A video that is still processing returns VIDEO_NOT_READY (409).
```

## 5. Collaborate: timeline comments and mentions

```ts
await client.comments.create(video.id, {
  body: "The retry budget here is 3 — see @dana for the rationale.",
  atSeconds: 42, // anchor the comment to a playback position
});

const thread = await client.comments.list(video.id);
```

## 6. Share

```ts
// Organization-only by default; create a link for external viewers.
const link = await client.sharing.create(video.id, { passcode: "optional" });

// A recipient resolves the shared video with the credential (public endpoint).
const shared = await client.sharing.resolve({ credential: link.credential, passcode: "optional" });
```

## 7. Search the knowledge base

```ts
// Search titles, descriptions, and transcripts within your authorized scope.
const hits = await client.search.videos({ query: "circuit breaker", limit: 20 });
```

## 8. Live collaboration (WebSocket)

```ts
const connection = client.connectRealtime({
  onEvent: (event) => {
    // new comments, processing-status updates, notifications, presence/typing
    console.log(event.type, event.payload);
  },
  onError: (err) => console.error(err),
  onClose: () => console.log("realtime closed"),
});

// later…
connection.close();
```

## 9. Automate with webhooks and API keys

```ts
// Organization-scoped API key — the secret is returned exactly once.
const key = await client.apiKeys.create({ name: "ci-bot" });

// Subscribe to outbound events (HTTPS URL, ≤2048 chars, supported event types).
await client.webhooks.create({
  url: "https://ci.example.com/hooks/streetstudio",
  events: ["video.ready", "comment.created"],
});
// Deliveries are signed, time out after 10s, and retry up to 5 times with backoff.
```

## Error handling

Every failure surfaces the shared taxonomy. Branch on the stable `code`:

```ts
import { AppError } from "@streetstudio/shared";

try {
  await client.playback.manifest(video.id);
} catch (err) {
  if (err instanceof AppError && err.code === "VIDEO_NOT_READY") {
    // still processing — poll `videos.get` or listen on the realtime channel
  }
}
```

See [`../docs/API.md`](../docs/API.md) for the complete endpoint and error
reference.
