const { handleRequest } = require("../../data-core/http");

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-auth-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: headers(), body: "" };
  }
  const headersIn = event.headers || {};
  const result = await handleRequest({
    httpMethod: event.httpMethod,
    path: "/api/login",
    body: event.body || "",
    token: headersIn["x-auth-token"] || headersIn["X-Auth-Token"] || "",
    event,
  });
  return { statusCode: result.statusCode, headers: headers(), body: JSON.stringify(result.body) };
};
