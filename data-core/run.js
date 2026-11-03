const { handleRequest } = require("./http");

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "").trim()));
    process.stdin.on("error", reject);
  });
}

function finish(statusCode, body) {
  process.stdout.write(String(statusCode) + "\n" + JSON.stringify(body), () => process.exit(0));
}

async function main() {
  try {
    const result = await handleRequest({
      httpMethod: process.env.DATA_METHOD || "GET",
      path: process.env.DATA_PATH || "",
      body: await readStdin(),
      token: process.env.DATA_TOKEN || "",
      event: null,
    });
    finish(result.statusCode, result.body);
  } catch (err) {
    finish(500, { error: err && err.message ? err.message : "store_failed" });
  }
}

main();
