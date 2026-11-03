const { openStore } = require("../data-core");

async function listServices(event) {
  const products = await openStore(event || null).listProducts();
  return (products || [])
    .filter((product) => product && product.active !== false)
    .map((product) => ({
      name: String(product.name || "").slice(0, 200),
      description: String(product.description || "").slice(0, 500),
      price: Number(product.price) || 0,
      currency: String(product.currency || "₸").slice(0, 8),
    }));
}

module.exports = { listServices };
