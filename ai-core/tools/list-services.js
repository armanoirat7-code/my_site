const { listServices } = require("../catalog");

module.exports = {
  name: "list_services",
  description: "Актуальные услуги магазина и цены. Вызывай перед любым ответом про стоимость или список услуг.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async run(_args, ctx) {
    const services = await listServices(ctx && ctx.event);
    if (!services.length) return { services: [], note: "Каталог пуст. Цены не называй." };
    return { services };
  },
};
