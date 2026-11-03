import { WHATSAPP_NUMBER } from "./contacts";

export { WHATSAPP_NUMBER };
export const SESSION_KEY = "oirat_shop_session_v2";

export function readSession() {
  try {
    const data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!data || !data.token) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function authHeaders() {
  const session = readSession();
  return session && session.token ? { "x-auth-token": session.token } : {};
}

export async function login(password) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    if (data && data.error === "admin_not_configured") return { error: "not_configured" };
  }
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.token) return null;
  const session = { token: data.token, role: data.role, name: data.name };
  saveSession(session);
  return session;
}
export const CART_KEY = "oirat_shop_cart_v1";

export function orderLink(productName, extra) {
  let text = `Здравствуйте! Хочу оформить заказ: ${productName}`;
  if (extra && extra.customerName) text += `\nИмя: ${extra.customerName}`;
  if (extra && extra.customerPhone) text += `\nТелефон: ${extra.customerPhone}`;
  if (extra && extra.customerEmail) text += `\nEmail: ${extra.customerEmail}`;
  if (extra && extra.itemsText) text += `\nСостав:\n${extra.itemsText}`;
  if (extra && extra.comment) text += `\nКомментарий: ${extra.comment}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function loadCart() {
  try {
    const data = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveCart(list) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(list || []));
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new CustomEvent("oirat-cart-change"));
  } catch {
    /* ignore */
  }
}

export function cartCount(list) {
  return (list || loadCart()).reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
}

function stockLimit(product) {
  return Math.max(0, Math.round(Number(product && product.quantity) || 0));
}

export function addToCart(product) {
  if (!product || !product.id) return loadCart();
  const maxQty = stockLimit(product);
  if (maxQty < 1) return loadCart();
  const list = loadCart();
  const found = list.find((item) => item && item.id === product.id);
  if (found) {
    found.qty = Math.min(maxQty, (Number(found.qty) || 0) + 1);
    found.name = product.name || found.name;
    found.price = Math.max(0, Number(product.price) || 0);
    found.currency = product.currency || found.currency || "₸";
    found.maxQty = maxQty;
  } else {
    list.push({
      id: product.id,
      name: product.name || "Товар",
      price: Math.max(0, Number(product.price) || 0),
      currency: product.currency || "₸",
      qty: 1,
      maxQty,
    });
  }
  saveCart(list);
  return list;
}

export function setCartQty(id, qty) {
  let list = loadCart().filter((item) => item && item.id);
  const current = list.find((item) => item.id === id);
  const maxQty = current ? Math.max(1, Number(current.maxQty) || 1) : 1;
  const next = Math.max(0, Math.min(maxQty, Number(qty) || 0));
  if (next <= 0) list = list.filter((item) => item.id !== id);
  else {
    list = list.map((item) => (item.id === id ? { ...item, qty: next, maxQty } : item));
  }
  saveCart(list);
  return list;
}

export function syncCart(products) {
  const byId = new Map(
    (products || [])
      .filter((product) => product && product.id && product.active !== false)
      .map((product) => [product.id, product])
  );
  const list = loadCart()
    .filter((item) => item && item.id && byId.has(item.id))
    .map((item) => {
      const product = byId.get(item.id);
      const maxQty = stockLimit(product);
      if (maxQty < 1) return null;
      return {
        id: product.id,
        name: product.name || item.name,
        price: Math.max(0, Number(product.price) || 0),
        currency: product.currency || "₸",
        qty: Math.min(maxQty, Math.max(1, Number(item.qty) || 1)),
        maxQty,
      };
    })
    .filter(Boolean);
  saveCart(list);
  return list;
}

export function cartTotals(list) {
  const totals = new Map();
  (list || loadCart()).forEach((item) => {
    const currency = item.currency || "₸";
    const line = (Number(item.price) || 0) * (Number(item.qty) || 0);
    totals.set(currency, (totals.get(currency) || 0) + line);
  });
  return Array.from(totals, ([currency, total]) => ({ currency, total }));
}

export function clearCart() {
  saveCart([]);
  return [];
}

export function cartItemsText(list) {
  return (list || loadCart())
    .map((item) => {
      const q = Number(item.qty) || 1;
      const line = `${item.name} × ${q}`;
      const price = (Number(item.price) || 0) * q;
      return price
        ? `${line} — ${price.toLocaleString("ru-RU")} ${item.currency || "₸"}`
        : line;
    })
    .join("\n");
}

export function phoneKey(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("8") && d.length === 11) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
}

export function clientsFromOrders(orders) {
  const byPhone = new Map();
  (orders || []).forEach((order) => {
    const key = phoneKey(order && order.customerPhone);
    if (!key || key.length < 10) return;
    const created = order.createdAt || "";
    const prev = byPhone.get(key);
    if (!prev) {
      byPhone.set(key, {
        id: "c-" + key,
        name: String(order.customerName || "Клиент").trim() || "Клиент",
        phone: String(order.customerPhone || "").trim(),
        phoneKey: key,
        email: String(order.customerEmail || "").trim(),
        channel: order.channel || "whatsapp",
        ordersCount: 1,
        lastOrderAt: created,
        lastProduct: order.productName || order.topic || "",
        createdAt: created,
      });
      return;
    }
    prev.ordersCount += 1;
    if (order.customerName) prev.name = String(order.customerName).trim();
    if (order.customerPhone) prev.phone = String(order.customerPhone).trim();
    if (order.customerEmail) prev.email = String(order.customerEmail).trim();
    if (created > (prev.lastOrderAt || "")) {
      prev.lastOrderAt = created;
      prev.lastProduct = order.productName || order.topic || prev.lastProduct || "";
    }
    if (created && (!prev.createdAt || created < prev.createdAt)) prev.createdAt = created;
  });
  return Array.from(byPhone.values()).sort((a, b) =>
    String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || ""))
  );
}

export async function saveOrder(input) {
  const payload = {
    source: input.source || "shop",
    productId: input.productId || "",
    productName: input.productName || "",
    customerName: String(input.customerName || "").trim(),
    customerPhone: String(input.customerPhone || "").trim(),
    customerEmail: String(input.customerEmail || "").trim(),
    comment: String(input.comment || "").trim(),
    topic: String(input.topic || "").trim(),
    channel: input.channel || "whatsapp",
    items: Array.isArray(input.items)
      ? input.items.map((item) => ({
          productId: item.productId || item.id || "",
          qty: Number(item.qty) || 1,
        }))
      : [],
  };
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data && data.error) || "save_failed" };
    return data && data.order ? data : { ok: false, error: "save_failed" };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

export async function getOrders() {
  try {
    const res = await fetch("/api/orders", {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.orders)) {
        const clients = Array.isArray(data.clients) ? data.clients : clientsFromOrders(data.orders);
        return { orders: data.orders, clients, fromApi: true };
      }
    }
  } catch {
    /* server unavailable */
  }
  return { orders: [], clients: [], fromApi: false };
}

export async function patchOrder(id, patch) {
  try {
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...authHeaders(),
      },
      body: JSON.stringify({ id, ...patch }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function formatPrice(product) {
  const cur = product.currency || "₸";
  const n = Number(product.price) || 0;
  return `${n.toLocaleString("ru-RU")} ${cur}`;
}

export async function getProducts() {
  try {
    const res = await fetch("/api/products", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.products) ? data.products : null;
  } catch {
    return null;
  }
}

export async function setProducts(products) {
  const clean = products.map((p) => ({
    ...p,
    image: p.image && String(p.image).startsWith("data:") ? "" : p.image || "",
  }));
  try {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", ...authHeaders() },
      body: JSON.stringify({ products: clean }),
    });
    return { savedApi: res.ok };
  } catch {
    return { savedApi: false };
  }
}

export async function uploadImage(file) {
  const dataUrl = await compressImage(file, 1200, 0.82);
  const ext = (file.type || "").includes("png") ? "png" : "jpg";
  const bare = dataUrl.replace(/^data:image\/[^;]+;base64,/, "");
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ext, data: bare }),
  });
  if (!res.ok) throw new Error("upload");
  const json = await res.json();
  if (!json.ok || !json.url) throw new Error("upload");
  return json.url;
}

function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read fail"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("img fail"));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function uid() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function cssUrl(url) {
  return `url("${String(url).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
}
