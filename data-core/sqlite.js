const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { orderFromInput, normalizeStoredOrder, normalizeProduct, phoneKey, STATUSES } = require("./shape");

const BLOB_KEY = "site.sqlite";

const SCHEMA = `
create table if not exists products (
  id text primary key,
  name text not null default '',
  description text not null default '',
  price integer not null default 0,
  currency text not null default '₸',
  quantity integer not null default 1,
  type text not null default 'service',
  image text not null default '',
  active integer not null default 1
);
create table if not exists orders (
  id text primary key,
  created_at text not null,
  source text not null default 'shop',
  status text not null default 'new',
  product_id text not null default '',
  product_name text not null default '',
  price integer not null default 0,
  currency text not null default '₸',
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',
  comment text not null default '',
  topic text not null default '',
  channel text not null default 'whatsapp',
  note text not null default '',
  client_id text not null default ''
);
create table if not exists clients (
  id text primary key,
  phone_key text not null unique,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  channel text not null default 'whatsapp',
  created_at text not null,
  updated_at text not null
);
create table if not exists users (
  id text primary key,
  name text not null,
  role text not null,
  password_hash text not null
);
create table if not exists sessions (
  token text primary key,
  user_id text not null,
  role text not null,
  created_at text not null
);
create table if not exists order_items (
  order_id text not null references orders(id) on delete cascade,
  position integer not null,
  product_id text not null default '',
  name text not null default '',
  price integer not null default 0,
  currency text not null default '₸',
  qty integer not null default 1,
  primary key (order_id, position)
);
`;

function onLambda() {
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function dbPath() {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  if (onLambda()) return "/tmp/site.sqlite";
  return path.join(process.cwd(), "data", "site.sqlite");
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function productCandidates() {
  return [
    process.env.PRODUCTS_PATH,
    path.join(process.cwd(), "data", "products.json"),
    path.join(__dirname, "data", "products.json"),
    path.join(__dirname, "..", "data", "products.json"),
    path.join(__dirname, "..", "..", "data", "products.json"),
  ].filter(Boolean);
}

function blobStore(event, name) {
  const { getStore, connectLambda } = require("@netlify/blobs");
  if (event && event.blobs) connectLambda(event);
  return getStore(name);
}

async function restore(event, file) {
  if (!onLambda()) return "local";
  const bytes = await blobStore(event, "site-sqlite").get(BLOB_KEY, { type: "arrayBuffer" });
  if (!bytes) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return "missing";
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(bytes));
  return "restored";
}

async function persist(event, file) {
  if (!onLambda() || !fs.existsSync(file)) return;
  await blobStore(event, "site-sqlite").set(BLOB_KEY, fs.readFileSync(file));
}

function insertOrder(db, order) {
  db.prepare(
    `insert into orders (
      id, created_at, source, status, product_id, product_name, price, currency,
      customer_name, customer_phone, customer_email, comment, topic, channel, note
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    order.id,
    order.createdAt,
    order.source,
    order.status,
    order.productId,
    order.productName,
    order.price,
    order.currency,
    order.customerName,
    order.customerPhone,
    order.customerEmail,
    order.comment,
    order.topic,
    order.channel,
    order.note
  );
  const insertItem = db.prepare(
    `insert into order_items (order_id, position, product_id, name, price, currency, qty)
     values (?, ?, ?, ?, ?, ?, ?)`
  );
  order.items.forEach((item, index) => {
    insertItem.run(order.id, index, item.productId, item.name, item.price, item.currency, item.qty);
  });
}

function seed(db) {
  let changed = false;
  const productCount = Number(db.prepare("select count(*) as n from products").get().n) || 0;
  if (productCount === 0) {
    const insert = db.prepare(
      `insert into products (id, name, description, price, currency, quantity, type, image, active)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const file of productCandidates()) {
      const data = readJson(file);
      const products = data && Array.isArray(data.products) ? data.products : [];
      const clean = products.map(normalizeProduct).filter((product) => product.name);
      if (!clean.length) continue;
      db.exec("begin");
      try {
        clean.forEach((product) => {
          insert.run(
            product.id,
            product.name,
            product.description,
            product.price,
            product.currency,
            product.quantity,
            product.type,
            product.image,
            product.active ? 1 : 0
          );
        });
        db.exec("commit");
        changed = true;
      } catch (err) {
        db.exec("rollback");
        throw err;
      }
      break;
    }
  }

  return changed;
}

async function importLegacyBlob(event, db) {
  if (!onLambda()) return false;
  if (Number(db.prepare("select count(*) as n from orders").get().n) > 0) return false;
  let data = null;
  try {
    data = await blobStore(event, "crm-orders").get("orders", { type: "json" });
  } catch {
    return false;
  }
  const orders = data && Array.isArray(data.orders) ? data.orders : [];
  if (!orders.length) return false;
  db.exec("begin");
  try {
    orders.map(normalizeStoredOrder).filter((order) => order.id).forEach((order) => insertOrder(db, order));
    db.exec("commit");
    return true;
  } catch (err) {
    db.exec("rollback");
    throw err;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return salt + ":" + digest;
}

function checkPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) return false;
  const next = crypto.scryptSync(String(password), parts[0], 32);
  const prev = Buffer.from(parts[1], "hex");
  if (next.length !== prev.length) return false;
  return crypto.timingSafeEqual(next, prev);
}

function migrate(db) {
  const columns = db.prepare("pragma table_info(orders)").all();
  if (!columns.some((column) => column.name === "client_id")) {
    db.exec("alter table orders add column client_id text not null default ''");
  }
  db.exec("create index if not exists orders_client_id on orders(client_id)");
}

function upsertClient(db, order) {
  const key = phoneKey(order.customerPhone);
  if (!key || key.length < 10) return "";
  const now = order.createdAt || new Date().toISOString();
  const existing = db.prepare("select id from clients where phone_key = ?").get(key);
  if (!existing) {
    const id = "c-" + key;
    db.prepare(
      `insert into clients (id, phone_key, name, phone, email, channel, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      key,
      order.customerName || "Клиент",
      order.customerPhone || "",
      order.customerEmail || "",
      order.channel || "whatsapp",
      now,
      now
    );
    return id;
  }
  db.prepare(
    `update clients set
       name = case when ? <> '' then ? else name end,
       phone = case when ? <> '' then ? else phone end,
       email = case when ? <> '' then ? else email end,
       channel = ?,
       updated_at = ?
     where id = ?`
  ).run(
    order.customerName || "",
    order.customerName || "",
    order.customerPhone || "",
    order.customerPhone || "",
    order.customerEmail || "",
    order.customerEmail || "",
    order.channel || "whatsapp",
    now,
    existing.id
  );
  return existing.id;
}

function backfillClients(db) {
  const missing = db.prepare("select * from orders where ifnull(client_id, '') = '' order by created_at").all();
  if (!missing.length) return false;
  missing.forEach((row) => {
    const id = upsertClient(db, mapOrder(row, []));
    if (id) db.prepare("update orders set client_id = ? where id = ?").run(id, row.id);
  });
  return true;
}

function reject(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function ensureUsers(db) {
  if (Number(db.prepare("select count(*) as n from users").get().n) > 0) return false;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_KEY || "";
  const managerPassword = process.env.MANAGER_PASSWORD || "";
  if (!adminPassword || !managerPassword) return false;
  const insert = db.prepare("insert into users (id, name, role, password_hash) values (?, ?, ?, ?)");
  insert.run("u-admin", "Администратор", "admin", hashPassword(adminPassword));
  insert.run("u-manager", "Менеджер", "manager", hashPassword(managerPassword));
  return true;
}

function retireKnownDefaults(db) {
  const specs = [
    ["u-admin", "Администратор", "admin", process.env.ADMIN_PASSWORD || process.env.ADMIN_KEY || "", "oirat2026"],
    ["u-manager", "Менеджер", "manager", process.env.MANAGER_PASSWORD || "", "manager2026"],
  ];
  specs.forEach(([id, name, role, next, known]) => {
    const row = db.prepare("select password_hash from users where id = ?").get(id);
    if (!row) {
      if (next) {
        db.prepare("insert into users (id, name, role, password_hash) values (?, ?, ?, ?)").run(
          id,
          name,
          role,
          hashPassword(next)
        );
      }
      return;
    }
    const isDefault = checkPassword(known, row.password_hash);
    const isDisabled = row.password_hash === "disabled";
    if (!isDefault && !isDisabled) return;
    if (next && next !== known) {
      db.prepare("update users set password_hash = ? where id = ?").run(hashPassword(next), id);
      return;
    }
    if (!next && isDefault) db.prepare("update users set password_hash = ? where id = ?").run("disabled", id);
  });
}

function assertContact(order) {
  if (String(order.customerName || "").trim().length < 2) reject(400, "bad_name");
  if (phoneKey(order.customerPhone).length < 11) reject(400, "bad_phone");
  const email = String(order.customerEmail || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reject(400, "bad_email");
}

function priceShopOrder(db, order) {
  const qtyById = new Map();
  order.items.forEach((item) => {
    if (!item.productId) return;
    qtyById.set(item.productId, (qtyById.get(item.productId) || 0) + item.qty);
  });
  if (!qtyById.size) reject(400, "empty_cart");
  const priced = [];
  let currency = "";
  qtyById.forEach((qty, id) => {
    const row = db.prepare("select * from products where id = ?").get(id);
    if (!row || Number(row.active) !== 1) reject(400, "unknown_product");
    const available = Number(row.quantity) || 0;
    if (qty > available) reject(400, "not_enough");
    const nextCurrency = row.currency || "₸";
    if (!currency) currency = nextCurrency;
    else if (currency !== nextCurrency) reject(400, "mixed_currency");
    if (row.type === "product") {
      const updated = db.prepare("update products set quantity = quantity - ? where id = ? and quantity >= ?").run(qty, id, qty);
      if (!updated.changes) reject(400, "not_enough");
    }
    priced.push({
      productId: row.id,
      name: row.name,
      price: Math.max(0, Number(row.price) || 0),
      currency: nextCurrency,
      qty,
    });
  });
  order.items = priced;
  order.price = priced.reduce((sum, item) => sum + item.price * item.qty, 0);
  order.currency = currency || "₸";
  order.productId = priced.map((item) => item.productId).join(",").slice(0, 400);
  order.productName = priced.map((item) => item.name + " ×" + item.qty).join(", ").slice(0, 200);
}

function storedClients(db) {
  const rows = db.prepare("select * from clients").all();
  return rows
    .map((row) => {
      const stats = db
        .prepare("select count(*) as n, max(created_at) as last_at, min(created_at) as first_at from orders where client_id = ?")
        .get(row.id);
      const last = db
        .prepare("select product_name, topic from orders where client_id = ? order by created_at desc limit 1")
        .get(row.id);
      return {
        id: row.id,
        name: row.name || "Клиент",
        phone: row.phone,
        phoneKey: row.phone_key,
        email: row.email,
        channel: row.channel,
        ordersCount: Number(stats && stats.n) || 0,
        lastOrderAt: (stats && stats.last_at) || row.updated_at,
        lastProduct: (last && (last.product_name || last.topic)) || "",
        createdAt: (stats && stats.first_at) || row.created_at,
      };
    })
    .sort((a, b) => String(b.lastOrderAt || "").localeCompare(String(a.lastOrderAt || "")));
}

function mapItem(row) {
  return {
    productId: row.product_id,
    name: row.name,
    price: Number(row.price) || 0,
    currency: row.currency,
    qty: Number(row.qty) || 1,
  };
}

function mapOrder(row, items) {
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    status: row.status,
    productId: row.product_id,
    productName: row.product_name,
    price: Number(row.price) || 0,
    currency: row.currency,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    comment: row.comment,
    topic: row.topic,
    channel: row.channel,
    note: row.note,
    items: items || [],
  };
}

function mapProduct(row) {
  return normalizeProduct({
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    quantity: row.quantity,
    type: row.type,
    image: row.image,
    active: row.active === 1 || row.active === true,
  });
}

async function session(event, fn, write) {
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = await restore(event, file);
  const db = new DatabaseSync(file);
  let closed = false;
  try {
    db.exec("pragma foreign_keys = on");
    db.exec("pragma busy_timeout = 5000");
    db.exec(SCHEMA);
    migrate(db);
    const seeded = seed(db);
    const imported = await importLegacyBlob(event, db);
    const accounts = ensureUsers(db);
    const clientsReady = backfillClients(db);
    const result = fn(db);
    db.close();
    closed = true;
    if (mode !== "local" && (write || seeded || imported || accounts || clientsReady)) await persist(event, file);
    return result;
  } finally {
    if (!closed) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
  }
}

function createStore(event) {
  return {
    listOrders() {
      return session(event, (db) => {
        const orders = db.prepare("select * from orders order by created_at desc limit 500").all();
        const items = db.prepare("select * from order_items where order_id = ? order by position");
        const mapped = orders.map((row) => mapOrder(row, items.all(row.id).map(mapItem)));
        return { orders: mapped, clients: storedClients(db) };
      }, false);
    },
    createOrder(input) {
      return session(event, (db) => {
        const order = orderFromInput(input);
        assertContact(order);
        db.exec("begin");
        try {
          if (order.source === "shop") priceShopOrder(db, order);
          else {
            order.items = [];
            order.price = 0;
          }
          insertOrder(db, order);
          const clientId = upsertClient(db, order);
          if (clientId) db.prepare("update orders set client_id = ? where id = ?").run(clientId, order.id);
          db.exec("commit");
        } catch (err) {
          db.exec("rollback");
          throw err;
        }
        return order;
      }, true);
    },
    patchOrder(id, patch) {
      return session(event, (db) => {
        const current = db.prepare("select * from orders where id = ?").get(id);
        if (!current) return null;
        const status = patch && STATUSES.includes(patch.status) ? patch.status : current.status;
        const note =
          patch && Object.prototype.hasOwnProperty.call(patch, "note")
            ? String(patch.note || "").slice(0, 800)
            : current.note;
        db.prepare("update orders set status = ?, note = ? where id = ?").run(status, note, id);
        const updated = db.prepare("select * from orders where id = ?").get(id);
        const items = db.prepare("select * from order_items where order_id = ? order by position").all(id);
        return mapOrder(updated, items.map(mapItem));
      }, true);
    },
    listProducts() {
      return session(event, (db) => db.prepare("select * from products order by name").all().map(mapProduct), false);
    },
    login(password) {
      return session(event, (db) => {
        retireKnownDefaults(db);
        const count = Number(db.prepare("select count(*) as n from users").get().n) || 0;
        if (!count) reject(503, "admin_not_configured");
        const users = db.prepare("select id, name, role, password_hash from users").all();
        const user = users.find((item) => checkPassword(password, item.password_hash));
        if (!user || (user.role !== "admin" && user.role !== "manager")) return null;
        const token = crypto.randomBytes(24).toString("hex");
        db.prepare("insert into sessions (token, user_id, role, created_at) values (?, ?, ?, ?)").run(
          token,
          user.id,
          user.role,
          new Date().toISOString()
        );
        return { token, role: user.role, name: user.name };
      }, true);
    },
    sessionRole(token) {
      const value = String(token || "");
      if (!/^[a-f0-9]{48}$/.test(value)) return Promise.resolve("");
      return session(event, (db) => {
        const row = db.prepare("select role from sessions where token = ?").get(value);
        return row && (row.role === "admin" || row.role === "manager") ? row.role : "";
      }, false);
    },
    saveProducts(products) {
      return session(event, (db) => {
        const clean = (Array.isArray(products) ? products : []).slice(0, 200).map(normalizeProduct);
        db.exec("begin");
        try {
          db.prepare("delete from products").run();
          const insert = db.prepare(
            `insert into products (id, name, description, price, currency, quantity, type, image, active)
             values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          clean.forEach((product) => {
            insert.run(
              product.id,
              product.name,
              product.description,
              product.price,
              product.currency,
              product.quantity,
              product.type,
              product.image,
              product.active ? 1 : 0
            );
          });
          db.exec("commit");
        } catch (err) {
          db.exec("rollback");
          throw err;
        }
        return clean;
      }, true);
    },
  };
}

module.exports = { createStore };
