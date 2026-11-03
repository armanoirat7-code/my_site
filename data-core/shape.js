const SOURCES = ["shop", "chat", "contact"];
const CHANNELS = ["whatsapp", "telegram"];
const STATUSES = ["new", "contacted", "in_progress", "done", "cancelled"];

function clip(value, max) {
  return String(value || "").slice(0, max);
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 30)
    .map((item) => ({
      productId: clip(item && (item.productId || item.id), 80),
      name: clip(item && item.name, 200),
      price: Number(item && item.price) || 0,
      currency: clip((item && item.currency) || "₸", 8),
      qty: Math.max(1, Math.min(99, Number(item && item.qty) || 1)),
    }))
    .filter((item) => item.name || item.productId);
}

function orderFromInput(input) {
  const sourceInput = input || {};
  const items = normalizeItems(sourceInput.items);
  const source = SOURCES.includes(sourceInput.source) ? sourceInput.source : "shop";
  const channel = CHANNELS.includes(sourceInput.channel) ? sourceInput.channel : "whatsapp";
  const priceFromItems = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  return {
    id: newId("o-"),
    createdAt: new Date().toISOString(),
    source,
    status: "new",
    productId: clip(sourceInput.productId || items.map((item) => item.productId).filter(Boolean).join(","), 400),
    productName: clip(
      sourceInput.productName || items.map((item) => item.name + " ×" + item.qty).join(", "),
      200
    ),
    price: items.length ? priceFromItems : Number(sourceInput.price) || 0,
    currency: clip(sourceInput.currency || (items[0] && items[0].currency) || "₸", 8),
    customerName: clip(sourceInput.customerName, 120),
    customerPhone: clip(sourceInput.customerPhone, 40),
    customerEmail: clip(sourceInput.customerEmail, 120),
    comment: clip(sourceInput.comment, 2000),
    topic: clip(sourceInput.topic, 400),
    channel,
    note: "",
    items,
  };
}

function normalizeStoredOrder(order) {
  const items = normalizeItems(order && order.items);
  return {
    id: clip(order && order.id, 80),
    createdAt: clip(order && order.createdAt, 40),
    source: SOURCES.includes(order && order.source) ? order.source : "shop",
    status: STATUSES.includes(order && order.status) ? order.status : "new",
    productId: clip(order && order.productId, 400),
    productName: clip(order && order.productName, 200),
    price: Number(order && order.price) || 0,
    currency: clip((order && order.currency) || "₸", 8),
    customerName: clip(order && order.customerName, 120),
    customerPhone: clip(order && order.customerPhone, 40),
    customerEmail: clip(order && order.customerEmail, 120),
    comment: clip(order && order.comment, 2000),
    topic: clip(order && order.topic, 400),
    channel: CHANNELS.includes(order && order.channel) ? order.channel : "whatsapp",
    note: clip(order && order.note, 800),
    items,
  };
}

function normalizeProduct(product) {
  const source = product || {};
  return {
    id: clip(source.id, 80) || newId("p-"),
    name: clip(source.name, 200),
    description: clip(source.description, 2000),
    price: Math.max(0, Math.round(Number(source.price) || 0)),
    currency: clip(source.currency || "₸", 8),
    quantity: Math.max(0, Math.round(Number(source.quantity) || 0)),
    type: source.type === "product" ? "product" : "service",
    image: String(source.image || "").startsWith("data:") ? "" : clip(source.image, 500),
    active: source.active !== false,
  };
}

function phoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) digits = "7" + digits.slice(1);
  if (digits.length === 10) digits = "7" + digits;
  return digits;
}

function clientsFromOrders(orders) {
  const byPhone = new Map();
  (orders || []).forEach((order) => {
    const key = phoneKey(order && order.customerPhone);
    if (!key || key.length < 10) return;
    const created = order.createdAt || "";
    const prev = byPhone.get(key);
    if (!prev) {
      byPhone.set(key, {
        id: "c-" + key,
        name: clip(order.customerName || "Клиент", 120) || "Клиент",
        phone: clip(order.customerPhone, 40),
        phoneKey: key,
        email: clip(order.customerEmail, 120),
        channel: order.channel || "whatsapp",
        ordersCount: 1,
        lastOrderAt: created,
        lastProduct: clip(order.productName || order.topic, 200),
        createdAt: created,
      });
      return;
    }
    prev.ordersCount += 1;
    if (order.customerName) prev.name = clip(order.customerName, 120);
    if (order.customerPhone) prev.phone = clip(order.customerPhone, 40);
    if (order.customerEmail) prev.email = clip(order.customerEmail, 120);
    if (created > (prev.lastOrderAt || "")) {
      prev.lastOrderAt = created;
      prev.lastProduct = clip(order.productName || order.topic || prev.lastProduct, 200);
    }
    if (created && (!prev.createdAt || created < prev.createdAt)) prev.createdAt = created;
  });
  return Array.from(byPhone.values()).sort((a, b) =>
    String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || ""))
  );
}

module.exports = {
  STATUSES,
  orderFromInput,
  normalizeStoredOrder,
  normalizeProduct,
  clientsFromOrders,
  phoneKey,
};
