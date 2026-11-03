const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { handleRequest } = require("../data-core/http");
const { runChat } = require("../ai-core");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const uploadsDir = path.join(root, "uploads");
const port = Number(process.env.PORT) || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    const index = text.indexOf("=");
    if (index < 1) continue;
    const key = text.slice(0, index).trim();
    const value = text.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function inside(base, target) {
  const rootPath = path.resolve(base);
  const filePath = path.resolve(target);
  return filePath === rootPath || filePath.startsWith(rootPath + path.sep);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("too_large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, type, body) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-auth-token",
    "Cache-Control": type.startsWith("text/html") || type.includes("json") ? "no-store" : "public, max-age=3600",
    "Content-Length": buffer.length,
  });
  res.end(buffer);
}

function sendJson(res, status, payload) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(payload));
}

function sendFile(res, file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  send(res, 200, type, fs.readFileSync(file));
  return true;
}

async function handleUpload(req, res) {
  const token = req.headers["x-auth-token"] || "";
  const session = await handleRequest({
    httpMethod: "GET",
    path: "/api/session",
    body: "",
    token,
    event: null,
  });
  if (session.statusCode !== 200 || !session.body || session.body.role !== "admin") {
    sendJson(res, 401, { ok: false, error: "forbidden" });
    return;
  }
  let payload;
  try {
    payload = JSON.parse((await readBody(req, 8 * 1024 * 1024)).toString("utf8") || "{}");
  } catch {
    sendJson(res, 400, { ok: false, error: "bad_json" });
    return;
  }
  let ext = String(payload.ext || "jpg").toLowerCase();
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) ext = "jpg";
  if (ext === "jpeg") ext = "jpg";
  let encoded = String(payload.data || "");
  const marker = encoded.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (marker) encoded = marker[1];
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) {
    sendJson(res, 400, { ok: false, error: "bad_image" });
    return;
  }
  fs.mkdirSync(uploadsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const name = "img-" + stamp + "-" + crypto.randomBytes(3).toString("hex") + "." + ext;
  const file = path.join(uploadsDir, name);
  if (!inside(uploadsDir, file)) {
    sendJson(res, 400, { ok: false, error: "bad_image" });
    return;
  }
  fs.writeFileSync(file, bytes);
  sendJson(res, 200, { ok: true, url: "/uploads/" + name });
}

async function handleChat(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 503, { error: "no_key" });
    return;
  }
  let body;
  try {
    body = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8") || "{}");
  } catch {
    sendJson(res, 400, { error: "bad_json" });
    return;
  }
  try {
    const result = await runChat({
      messages: Array.isArray(body.messages) ? body.messages : [],
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.BAZIS_AI_MODEL || "",
      event: null,
    });
    sendJson(res, 200, { reply: result.reply, actions: result.actions || [] });
  } catch (err) {
    const code = err && err.code ? err.code : "chat_failed";
    const status = err && err.statusCode ? err.statusCode : 502;
    sendJson(res, status, { error: code });
  }
}

loadEnv(path.join(root, ".env"));
fs.mkdirSync(uploadsDir, { recursive: true });
if (process.env.SQLITE_PATH) fs.mkdirSync(path.dirname(process.env.SQLITE_PATH), { recursive: true });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    if (req.method === "OPTIONS") {
      send(res, 204, "text/plain; charset=utf-8", "");
      return;
    }
    if (pathname === "/api/chat" && req.method === "POST") {
      await handleChat(req, res);
      return;
    }
    if (pathname === "/api/upload" && req.method === "POST") {
      await handleUpload(req, res);
      return;
    }
    if (
      pathname === "/api/orders" ||
      pathname === "/api/products" ||
      pathname === "/api/login" ||
      pathname === "/api/session"
    ) {
      const raw = req.method === "GET" || req.method === "HEAD" ? "" : (await readBody(req, 2 * 1024 * 1024)).toString("utf8");
      const result = await handleRequest({
        httpMethod: req.method,
        path: pathname,
        body: raw,
        token: req.headers["x-auth-token"] || "",
        event: null,
      });
      sendJson(res, result.statusCode, result.body);
      return;
    }
    if (pathname.startsWith("/uploads/")) {
      const name = pathname.slice("/uploads/".length);
      const uploaded = path.join(uploadsDir, name);
      const baked = path.join(distDir, "uploads", name);
      if (inside(uploadsDir, uploaded) && sendFile(res, uploaded)) return;
      if (inside(path.join(distDir, "uploads"), baked) && sendFile(res, baked)) return;
      send(res, 404, "text/plain; charset=utf-8", "Not found");
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.join(distDir, relative);
    if (inside(distDir, file) && sendFile(res, file)) return;
    if (!path.extname(pathname) && sendFile(res, path.join(distDir, "index.html"))) return;
    send(res, 404, "text/plain; charset=utf-8", "Not found");
  } catch (err) {
    const status = err && err.statusCode ? err.statusCode : 500;
    sendJson(res, status, { error: status === 413 ? "too_large" : "server_failed" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("Site:  http://127.0.0.1:" + port + "/");
  console.log("Admin: http://127.0.0.1:" + port + "/admin");
});
