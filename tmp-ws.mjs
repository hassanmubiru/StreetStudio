// Verify the WebSocket realtime channel against the running server.
import WebSocket from "ws";

const B = "http://localhost:8080";
const email = `ws-${Date.now()}@example.com`;
const password = "CorrectHorse9pass";

async function post(path, body, token) {
  const res = await fetch(B + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function connect(token) {
  return new Promise((resolve) => {
    const url = token
      ? `ws://localhost:8080/realtime?token=${encodeURIComponent(token)}`
      : `ws://localhost:8080/realtime`;
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch {}
      resolve({ outcome: "timeout" });
    }, 4000);
    ws.on("message", (data) => {
      clearTimeout(timer);
      const frame = JSON.parse(data.toString());
      ws.close();
      resolve({ outcome: "open", frame });
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      resolve({ outcome: "rejected", status: res.statusCode });
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      resolve({ outcome: "error", message: String(err.message || err) });
    });
  });
}

await post("/auth/register", { email, password });
const login = await post("/auth/login", { email, password });
const token = login.accessToken;
console.log("token_len =", (token || "").length);

const good = await connect(token);
console.log("connect WITH valid token =>", JSON.stringify(good));

const bad = await connect(undefined);
console.log("connect WITHOUT token   =>", JSON.stringify(bad));

const badToken = await connect("not-a-real-token");
console.log("connect WITH bad token  =>", JSON.stringify(badToken));

const pass =
  good.outcome === "open" &&
  good.frame?.type === "connected" &&
  (bad.outcome === "rejected" || bad.outcome === "error") &&
  (badToken.outcome === "rejected" || badToken.outcome === "error");
console.log("\nRESULT:", pass ? "PASS ✅" : "FAIL ❌");
process.exit(pass ? 0 : 1);
