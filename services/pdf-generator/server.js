const fs = require("fs");
const http = require("http");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { listProducts, getOrder, getClient, dbStamp, dbFile } = require("./read");
const { buildInvoice, buildCatalog, buildClient } = require("./templates/build");
const { htmlToPdf } = require("./render");

const port = Number(process.env.PDF_PORT) || 5191;
const cacheDir = path.join(__dirname, ".cache");
function authorized(req) {
  const token = String(req.headers["x-auth-token"] || "");
  if (!/^[a-f0-9]{48}$/.test(token)) return false;
  const db = new DatabaseSync(dbFile, { readOnly: true, fileMustExist: true });
  try {
    const row = db.prepare("select role from sessions where token = ?").get(token);
    return Boolean(row && (row.role === "admin" || row.role === "manager"));
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-auth-token",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function safeId(value, pattern) {
  const id = decodeURIComponent(value || "");
  return pattern.test(id) ? id : "";
}

async function catalogPdf() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, "catalog.pdf");
  const stamp = dbStamp();
  if (fs.existsSync(cached) && fs.statSync(cached).mtimeMs >= stamp) {
    return fs.readFileSync(cached);
  }
  const pdf = await htmlToPdf(buildCatalog(listProducts()), true);
  fs.writeFileSync(cached, pdf);
  return pdf;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "text/plain", "");
    return;
  }
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (req.method === "GET" && url.pathname === "/health") {
      send(res, 200, "application/json; charset=utf-8", JSON.stringify({ ok: true }));
      return;
    }
    if (!authorized(req)) {
      send(res, 401, "application/json; charset=utf-8", JSON.stringify({ error: "unauthorized" }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/catalog.pdf") {
      send(res, 200, "application/pdf", await catalogPdf());
      return;
    }
    const orderMatch = url.pathname.match(/^\/orders\/([^/]+)\.pdf$/);
    if (req.method === "GET" && orderMatch) {
      const id = safeId(orderMatch[1], /^o-[a-z0-9-]{4,80}$/i);
      const order = id && getOrder(id);
      if (!order) {
        send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "missing" }));
        return;
      }
      send(res, 200, "application/pdf", await htmlToPdf(await buildInvoice(order), false));
      return;
    }
    const clientMatch = url.pathname.match(/^\/clients\/([^/]+)\.pdf$/);
    if (req.method === "GET" && clientMatch) {
      const id = safeId(clientMatch[1], /^c-\d{10,15}$/);
      const client = id && getClient(id);
      if (!client) {
        send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "missing" }));
        return;
      }
      send(res, 200, "application/pdf", await htmlToPdf(await buildClient(client), false));
      return;
    }
    send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "not_found" }));
  } catch (err) {
    send(res, 500, "application/json; charset=utf-8", JSON.stringify({ error: err && err.message ? err.message : "pdf_failed" }));
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write("PDF: http://127.0.0.1:" + port + "/\n");
});
