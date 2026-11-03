module.exports = {
  name: "request_handoff",
  description:
    "Показать клиенту карточку связи с Арманом. Вызывай при заказе, пилоте, договоре или просьбе поговорить с человеком.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Кратко, о чём заявка" },
    },
    required: ["topic"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const topic = String((args && args.topic) || "заявка").slice(0, 280);
    ctx.actions.push({ type: "handoff", topic });
    return { ok: true, shown: "handoff" };
  },
};
