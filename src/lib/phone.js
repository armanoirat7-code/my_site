export function digits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

export function normalizePhone(phone) {
  let d = digits(phone);
  if (d.startsWith("8") && d.length === 11) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
}

export function formatPhoneInput(raw) {
  const d = digits(raw).slice(0, 11);
  if (!d) return "";
  if (d.startsWith("8") || d.startsWith("7")) {
    const rest = d.slice(1);
    let out = "+7";
    if (rest.length) out += " " + rest.slice(0, 3);
    if (rest.length > 3) out += " " + rest.slice(3, 6);
    if (rest.length > 6) out += " " + rest.slice(6, 8);
    if (rest.length > 8) out += " " + rest.slice(8, 10);
    return out;
  }
  return "+7" + d;
}

export function isValidEmail(value) {
  const v = String(value || "").trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
