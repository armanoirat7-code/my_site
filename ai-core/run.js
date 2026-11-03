const { runChat } = require("./index");

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "").trim()));
    process.stdin.on("error", reject);
  });
}

function finish(payload, code) {
  process.stdout.write(JSON.stringify(payload), () => process.exit(code));
}

async function main() {
  let body;
  try {
    body = JSON.parse((await readStdin()) || "{}");
  } catch {
    finish({ error: "bad_json" }, 1);
    return;
  }

  try {
    const result = await runChat({
      messages: Array.isArray(body.messages) ? body.messages : [],
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.BAZIS_AI_MODEL || "gpt-4o-mini",
    });
    finish({ reply: result.reply, actions: result.actions || [] }, 0);
  } catch (err) {
    const code = err && err.code ? err.code : "chat_failed";
    finish({ error: code }, code === "no_key" ? 2 : 1);
  }
}

main();
