const { openStore } = require("./index");

function fail(statusCode, error) {
  return { statusCode, body: { error } };
}

function staff(role) {
  return role === "admin" || role === "manager";
}

async function handleRequest({ httpMethod, path, body, token, event }) {
  const route = String(path || "");
  const store = openStore(event);
  let input = {};
  if (body) {
    try {
      input = JSON.parse(body);
    } catch {
      return fail(400, "bad_json");
    }
  }

  try {
    if (route.endsWith("/login")) {
      if (httpMethod !== "POST") return fail(405, "method");
      const session = await store.login(input.password);
      if (!session) return fail(401, "unauthorized");
      return { statusCode: 200, body: session };
    }

    const role = await store.sessionRole(token);

    if (route.endsWith("/session")) {
      if (httpMethod !== "GET") return fail(405, "method");
      if (!staff(role)) return fail(401, "unauthorized");
      return { statusCode: 200, body: { ok: true, role } };
    }

    if (route.endsWith("/orders")) {
      if (httpMethod === "GET") {
        if (!staff(role)) return fail(401, "unauthorized");
        return { statusCode: 200, body: await store.listOrders() };
      }
      if (httpMethod === "POST") {
        const order = await store.createOrder(input);
        return { statusCode: 200, body: { ok: true, order } };
      }
      if (httpMethod === "PATCH") {
        if (!staff(role)) return fail(401, "unauthorized");
        if (!input.id) return fail(400, "no_id");
        const order = await store.patchOrder(String(input.id), input);
        if (!order) return fail(404, "missing");
        return { statusCode: 200, body: { ok: true, order } };
      }
      return fail(405, "method");
    }

    if (route.endsWith("/products")) {
      if (httpMethod === "GET") {
        return { statusCode: 200, body: { products: await store.listProducts() } };
      }
      if (httpMethod === "POST") {
        if (role !== "admin") return fail(403, "forbidden");
        if (!input || !Array.isArray(input.products)) return fail(400, "no_products");
        const products = await store.saveProducts(input.products);
        return { statusCode: 200, body: { ok: true, products } };
      }
      return fail(405, "method");
    }

    return fail(404, "not_found");
  } catch (err) {
    const statusCode = err && err.statusCode ? err.statusCode : 500;
    return fail(statusCode, err && err.message ? err.message : "store_failed");
  }
}

module.exports = { handleRequest };
