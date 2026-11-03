function normalizeContent(content) {
  if (typeof content === "string") return content.slice(0, 12000);
  if (!Array.isArray(content)) return "";

  const parts = [];
  for (const part of content.slice(0, 8)) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      parts.push({ type: "text", text: part.text.slice(0, 12000) });
    } else if (part.type === "image_url" && part.image_url && typeof part.image_url.url === "string") {
      const url = part.image_url.url;
      if (url.startsWith("data:image/") && url.length < 2_500_000) {
        parts.push({ type: "image_url", image_url: { url } });
      }
    }
  }
  if (!parts.length) return "";
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

module.exports = { normalizeContent };
