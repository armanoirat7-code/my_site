const { handleRequest } = require("../../data-core/http");

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-auth-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers(), body: "" };
  }
  const result = await handleRequest({
    httpMethod: event.httpMethod,
    path: "/api/products",
    body: event.body || "",
    token: (event.headers && (event.headers["x-auth-token"] || event.headers["X-Auth-Token"])) || "",
    event,
  });
  return { statusCode: result.statusCode, headers: headers(), body: JSON.stringify(result.body) };
};
