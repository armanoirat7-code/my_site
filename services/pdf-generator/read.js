const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const root = path.join(__dirname, "..", "..");
const dbFile = process.env.SQLITE_PATH || path.join(root, "data", "site.sqlite");

function phoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("8") && digits.length === 11) digits = "7" + digits.slice(1);
  if (digits.length === 10) digits = "7" + digits;
  return digits;
}

function openDb() {
  return new DatabaseSync(dbFile, { readOnly: true, fileMustExist: true });
}

function withDb(fn) {
  const db = openDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function mapItem(row) {
  return {
    productId: row.product_id || "",
    name: row.name || "",
    price: Number(row.price) || 0,
    currency: row.currency || "₸",
    qty: Number(row.qty) || 1,
  };
}

function mapOrder(row, items) {
  return {
    id: row.id,
    createdAt: row.created_at || "",
    source: row.source || "shop",
    status: row.status || "new",
    productId: row.product_id || "",
    productName: row.product_name || "",
    price: Number(row.price) || 0,
    currency: row.currency || "₸",
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    customerEmail: row.customer_email || "",
    comment: row.comment || "",
    topic: row.topic || "",
    channel: row.channel || "whatsapp",
    note: row.note || "",
    clientId: row.client_id || "",
    items: items || [],
  };
}

function orderItems(db, id) {
  return db.prepare("select * from order_items where order_id = ? order by position").all(id).map(mapItem);
}

function listOrders() {
  return withDb((db) => {
    const rows = db.prepare("select * from orders order by created_at desc limit 500").all();
    return rows.map((row) => mapOrder(row, orderItems(db, row.id)));
  });
}

function getOrder(id) {
  return withDb((db) => {
    const row = db.prepare("select * from orders where id = ?").get(id);
    if (!row) return null;
    return mapOrder(row, orderItems(db, id));
  });
}

function listProducts() {
  return withDb((db) =>
    db
      .prepare(
        "select id, name, description, price, currency, quantity, type, image, active from products order by name"
      )
      .all()
      .map((row) => ({
        id: row.id,
        name: row.name || "",
        description: row.description || "",
        price: Number(row.price) || 0,
        currency: row.currency || "₸",
        quantity: Number(row.quantity) || 0,
        type: row.type === "product" ? "product" : "service",
        image: row.image || "",
        active: row.active === 1,
      }))
  );
}

function clientsFromOrders(orders) {
  const byPhone = new Map();
  orders.forEach((order) => {
    const key = phoneKey(order.customerPhone);
    if (!key || key.length < 10) return;
    const created = order.createdAt || "";
    const prev = byPhone.get(key);
    if (!prev) {
      byPhone.set(key, {
        id: "c-" + key,
        name: order.customerName || "Клиент",
        phone: order.customerPhone || "",
        email: order.customerEmail || "",
        channel: order.channel || "whatsapp",
        ordersCount: 1,
        lastOrderAt: created,
        lastProduct: order.productName || order.topic || "",
        orders: [order],
      });
      return;
    }
    prev.ordersCount += 1;
    prev.orders.push(order);
    if (order.customerName) prev.name = order.customerName;
    if (order.customerEmail) prev.email = order.customerEmail;
    if (created > (prev.lastOrderAt || "")) {
      prev.lastOrderAt = created;
      prev.lastProduct = order.productName || order.topic || prev.lastProduct;
    }
  });
  return Array.from(byPhone.values());
}

function getClient(id) {
  return withDb((db) => {
    const row = db.prepare("select * from clients where id = ?").get(id);
    if (!row) return null;
    const orders = listOrders().filter((order) => order.clientId === id || phoneKey(order.customerPhone) === row.phone_key);
    const latest = orders.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    return {
      id: row.id,
      name: row.name || "Клиент",
      phone: row.phone,
      email: row.email,
      channel: row.channel,
      ordersCount: orders.length,
      lastOrderAt: (latest && latest.createdAt) || row.updated_at || "",
      lastProduct: (latest && (latest.productName || latest.topic)) || "",
      orders,
    };
  });
}

function imageDataUrl(imagePath) {
  const rel = String(imagePath || "").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return "";
  const uploads = path.resolve(root, "uploads");
  const full = path.resolve(root, rel);
  if (full !== uploads && !full.startsWith(uploads + path.sep)) return "";
  if (!fs.existsSync(full)) return "";
  const bytes = fs.readFileSync(full);
  if (bytes.length > 2_500_000) return "";
  const ext = path.extname(full).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return "data:" + mime + ";base64," + bytes.toString("base64");
}

function dbStamp() {
  try {
    return fs.statSync(dbFile).mtimeMs;
  } catch {
    return 0;
  }
}

module.exports = { listProducts, listOrders, getOrder, getClient, imageDataUrl, dbStamp, dbFile };
