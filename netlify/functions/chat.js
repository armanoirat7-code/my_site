const { runChat } = require("../../ai-core");

function headers() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

exports.handler = async (event) => {
  const hdrs = headers();

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: hdrs, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: hdrs, body: JSON.stringify({ error: "method" }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers: hdrs, body: JSON.stringify({ error: "no_key" }) };
  }

  let messages;
  try {
    const body = JSON.parse(event.body || "{}");
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return { statusCode: 400, headers: hdrs, body: JSON.stringify({ error: "bad_json" }) };
  }

  try {
    const result = await runChat({
      messages,
      apiKey,
      model: process.env.BAZIS_AI_MODEL,
      event,
    });
    return {
      statusCode: 200,
      headers: hdrs,
      body: JSON.stringify({ reply: result.reply, actions: result.actions || [] }),
    };
  } catch (err) {
    const status = err && err.statusCode ? err.statusCode : 502;
    const error = err && err.code ? err.code : "chat_failed";
    return { statusCode: status, headers: hdrs, body: JSON.stringify({ error }) };
  }
};
