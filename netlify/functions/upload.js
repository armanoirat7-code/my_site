const crypto = require("crypto");
const { openStore } = require("../../data-core");

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-auth-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function fail(statusCode, error) {
  return { statusCode, headers: headers(), body: JSON.stringify({ ok: false, error }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers(), body: "" };
  }
  if (event.httpMethod !== "POST") return fail(405, "method");

  const headersIn = event.headers || {};
  const token = headersIn["x-auth-token"] || headersIn["X-Auth-Token"] || "";
  const role = await openStore(event).sessionRole(token);
  if (role !== "admin") return fail(403, "forbidden");

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return fail(400, "bad_json");
  }

  let ext = String(body.ext || "jpg").toLowerCase();
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) ext = "jpg";
  if (ext === "jpeg") ext = "jpg";
  let encoded = String(body.data || "");
  const marker = encoded.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (marker) encoded = marker[1];
  let bytes;
  try {
    bytes = Buffer.from(encoded, "base64");
  } catch {
    return fail(400, "bad_image");
  }
  if (!bytes.length || bytes.length > 3 * 1024 * 1024) return fail(400, "bad_image");

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const name = "img-" + stamp + "-" + crypto.randomBytes(3).toString("hex") + "." + ext;
  const { getStore, connectLambda } = require("@netlify/blobs");
  if (event.blobs) connectLambda(event);
  await getStore("site-images").set(name, bytes);
  return {
    statusCode: 200,
    headers: headers(),
    body: JSON.stringify({ ok: true, url: "/api/media?name=" + encodeURIComponent(name) }),
  };
};
