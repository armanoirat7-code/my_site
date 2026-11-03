const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { imageDataUrl } = require("../read");

const css = fs.readFileSync(path.join(__dirname, "print.css"), "utf8");
const contacts = require("../../../data/contacts.json");

const BRAND = {
  name: "AI DRONE / CONSTRUCTION",
  person: "Ойрат Арман Талгатович",
  line: "Контроль качества строительных объектов",
};

const STATUS = {
  new: "Новая",
  contacted: "Связались",
  in_progress: "В работе",
  done: "Готово",
  cancelled: "Отмена",
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value, currency) {
  const amount = Math.round(Number(value) || 0);
  const text = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return text + " " + (currency || "₸");
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return day + "." + month + "." + date.getFullYear();
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}

function linesOf(order) {
  if (Array.isArray(order.items) && order.items.length) return order.items;
  if (!order.productName && !order.price) return [];
  return [
    {
      productId: order.productId || "—",
      name: order.productName || order.topic || "Заявка",
      price: order.price,
      currency: order.currency,
      qty: 1,
    },
  ];
}

async function buildInvoice(order) {
  const lines = linesOf(order);
  const currency = order.currency || (lines[0] && lines[0].currency) || "₸";
  const rows = lines
    .map((item, index) => {
      const qty = Number(item.qty) || 1;
      const sum = (Number(item.price) || 0) * qty;
      return `<tr><td>${index + 1}</td><td>${esc(item.name)}</td><td>${esc(item.productId || "—")}</td><td class="num">${qty}</td><td class="num">${esc(money(item.price, item.currency || currency))}</td><td class="num">${esc(money(sum, item.currency || currency))}</td></tr>`;
    })
    .join("");
  const site = String(process.env.PDF_SITE_URL || contacts.site || "").replace(/\/$/, "");
  const link = site + "/admin?order=" + encodeURIComponent(order.id);
  const qr = await QRCode.toDataURL(link, { margin: 0, width: 180 });
  const number = String(order.id || "").replace(/^o-/, "");
  const body = `
    <div class="top">
      <div class="brand">${esc(BRAND.name)}<small>${esc(BRAND.person)}<br>${esc(BRAND.line)}</small></div>
      <div class="doc-kind">
        <h1>ЗАЯВКА</h1>
        <div class="meta">№ ${esc(number)}<br>Дата заказа: ${esc(when(order.createdAt))}<br>Сформирован: ${esc(when(new Date().toISOString()))}</div>
      </div>
    </div>
    <div class="rule"></div>
    <div class="cols">
      <div class="box">
        <h2>Исполнитель</h2>
        <div>${esc(BRAND.name)}</div>
        <div>${esc(BRAND.person)}</div>
        <div>${esc(contacts.phoneDisplay)}</div>
        <div>${esc(contacts.email)}</div>
      </div>
      <div class="box">
        <h2>Заказчик</h2>
        <div>${esc(order.customerName || "Имя не указано")}</div>
        <div>${esc(order.customerPhone || "Телефон не указан")}</div>
        <div>${esc(order.customerEmail || "Email не указан")}</div>
        <div>Канал: ${esc(order.channel || "whatsapp")}</div>
        <div>Статус: ${esc(STATUS[order.status] || order.status || "Новая")}</div>
      </div>
    </div>
    <p class="muted" style="margin-top:10px">Это заявка, не фискальный счёт. Передача через ${esc(order.channel || "whatsapp")}.</p>
    <table>
      <thead><tr><th>№</th><th>Наименование</th><th>Артикул</th><th class="num">Кол-во</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6">В заявке нет строк.</td></tr>`}</tbody>
    </table>
    <div class="totals">
      <div class="grand"><span>Итого</span><span>${esc(money(order.price, currency))}</span></div>
    </div>
    ${order.comment ? `<p style="margin-top:14px"><strong>Комментарий.</strong> ${esc(order.comment)}</p>` : ""}
    <div class="foot">
      <p class="note">Документ собран из заявки в CRM. Итог равен сумме позиций по ценам каталога. QR открывает эту заявку в админке.</p>
      <div class="qr"><img src="${qr}" alt=""><span>Проверка заказа</span></div>
    </div>`;
  return page("Заявка " + number, body);
}

function buildCatalog(products) {
  const today = when(new Date().toISOString());
  const cards = products
    .map((product) => {
      const photo = imageDataUrl(product.image);
      const shot = photo ? ` style="background-image:url('${photo}')"` : "";
      return `<article class="card"><div class="shot"${shot}></div><div class="card-body"><h2>${esc(product.name)}</h2><p>${esc(product.description || "Описание не заполнено")}</p><div class="price">${esc(money(product.price, product.currency))}</div><div class="sku">Артикул ${esc(product.id)} · ${product.active ? "в продаже" : "скрыт"} · ${product.type === "product" ? "товар" : "услуга"}</div></div></article>`;
    })
    .join("");
  const body = `
    <section class="cover">
      <div class="brand">${esc(BRAND.name)}</div>
      <div>
        <h1>Каталог услуг</h1>
        <p class="lead">${esc(BRAND.line)}. Прайс для партнёров и клиентов.</p>
      </div>
      <div>
        <p>Актуально на ${esc(today)}</p>
        <p class="muted">${esc(BRAND.person)}. Оптовая цена в базе не хранится: указана одна действующая цена услуги.</p>
      </div>
    </section>
    <div class="grid">${cards}</div>`;
  return page("Каталог услуг", body);
}

async function buildClient(client) {
  const rows = (client.orders || [])
    .map((order) => {
      const number = String(order.id || "").replace(/^o-/, "");
      return `<tr><td>${esc(when(order.createdAt))}</td><td>${esc(number)}</td><td>${esc(order.productName || order.topic || "Заявка")}</td><td>${esc(STATUS[order.status] || order.status || "")}</td><td class="num">${esc(money(order.price, order.currency))}</td></tr>`;
    })
    .join("");
  const body = `
    <div class="top">
      <div class="brand">${esc(BRAND.name)}<small>${esc(BRAND.person)}</small></div>
      <div class="doc-kind"><h1>КЛИЕНТ</h1><div class="meta">Сформирован: ${esc(when(new Date().toISOString()))}</div></div>
    </div>
    <div class="rule"></div>
    <div class="cols">
      <div class="box"><h2>Контакт</h2><div>${esc(client.name || "Клиент")}</div><div>${esc(client.phone || "—")}</div><div>${esc(client.email || "Email не указан")}</div><div>Канал: ${esc(client.channel || "whatsapp")}</div></div>
      <div class="box"><h2>Сводка</h2><div>Заказов: ${Number(client.ordersCount) || 0}</div><div>Последний: ${esc(when(client.lastOrderAt))}</div><div>${esc(client.lastProduct || "")}</div><p class="muted">Отдельные реквизиты клиента в базе не хранятся. Карточка собрана из заявок с одним телефоном.</p></div>
    </div>
    <table>
      <thead><tr><th>Дата</th><th>Номер</th><th>Заявка</th><th>Статус</th><th class="num">Сумма</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">Заявок нет.</td></tr>`}</tbody>
    </table>`;
  return page("Клиент " + (client.name || ""), body);
}

module.exports = { buildInvoice, buildCatalog, buildClient };
