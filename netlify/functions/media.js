const { getStore, connectLambda } = require("@netlify/blobs");

const NAME = /^img-[0-9a-z.-]+\.(jpg|jpeg|png|webp)$/i;

function headers(type) {
  return {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=31536000",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers("text/plain"), body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: headers("application/json"), body: JSON.stringify({ error: "method" }) };
  }
  const name = String((event.queryStringParameters && event.queryStringParameters.name) || "");
  if (!NAME.test(name)) {
    return { statusCode: 400, headers: headers("application/json"), body: JSON.stringify({ error: "bad_name" }) };
  }
  if (event.blobs) connectLambda(event);
  const bytes = await getStore("site-images").get(name, { type: "arrayBuffer" });
  if (!bytes) {
    return { statusCode: 404, headers: headers("application/json"), body: JSON.stringify({ error: "missing" }) };
  }
  const ext = name.split(".").pop().toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return {
    statusCode: 200,
    headers: headers(type),
    body: Buffer.from(bytes).toString("base64"),
    isBase64Encoded: true,
  };
};
