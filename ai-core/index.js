const SYSTEM_PROMPT = require("./prompt");
const { normalizeContent } = require("./normalize");
const tools = require("./tools");

const MAX_ROUNDS = 3;

function fail(code, statusCode) {
  const err = new Error(code);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function toolSchemas() {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function runChat({ messages, apiKey, model, event }) {
  if (!apiKey) throw fail("no_key", 503);

  const openaiMessages = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const message of (messages || []).slice(-8)) {
    if (!message || (message.role !== "user" && message.role !== "assistant")) continue;
    const content = normalizeContent(message.content);
    if (!content) continue;
    openaiMessages.push({ role: message.role, content });
  }
  if (openaiMessages.length === 1) throw fail("empty", 400);

  const actions = [];
  const ctx = { actions, event };
  const schemas = toolSchemas();

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const lastRound = round === MAX_ROUNDS - 1;
    const payload = {
      model: model || "gpt-4o-mini",
      temperature: 0.55,
      messages: openaiMessages,
    };
    if (!lastRound) payload.tools = schemas;

    let res;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw fail("chat_failed", 502);
    }

    if (!res.ok) throw fail("openai_" + res.status, 502);
    const data = await res.json();
    const message = data.choices && data.choices[0] && data.choices[0].message;
    if (!message) throw fail("empty", 502);

    const calls = Array.isArray(message.tool_calls) ? message.tool_calls.slice(0, 4) : [];
    if (!calls.length || lastRound) {
      const reply = String(message.content || "").trim();
      if (!reply) throw fail("empty", 502);
      return { reply, actions };
    }

    openaiMessages.push({
      role: "assistant",
      content: message.content || null,
      tool_calls: calls,
    });

    for (const call of calls) {
      const name = call.function && call.function.name;
      const tool = tools.find((item) => item.name === name);
      let result;
      try {
        const args = JSON.parse((call.function && call.function.arguments) || "{}");
        result = tool ? await tool.run(args || {}, ctx) : { error: "unknown_tool" };
      } catch {
        result = { error: "tool_failed" };
      }
      openaiMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 12000),
      });
    }
  }

  throw fail("empty", 502);
}

module.exports = { runChat };
