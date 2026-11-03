import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TELEGRAM_URL } from "../lib/contacts";
import {
  clearSession,
  clientsFromOrders,
  cssUrl,
  formatPrice,
  getOrders,
  getProducts,
  login as loginRequest,
  patchOrder,
  readSession,
  setProducts,
  uid,
  uploadImage,
} from "../lib/store";

const PDF_BASE = import.meta.env.VITE_PDF_BASE || (import.meta.env.DEV ? "http://127.0.0.1:5191" : "");
const STATUS_LABEL = {
  new: "NEW",
  contacted: "Связались",
  in_progress: "В работе",
  done: "Готово",
  cancelled: "Отмена",
};
const SOURCE_LABEL = { shop: "Магазин", chat: "Чат", contact: "Контакты" };
const CHANNEL_LABEL = { whatsapp: "WhatsApp", telegram: "Telegram" };

function normalizeCurrency(cur) {
  const map = { тг: "₸", тенге: "₸", KZT: "₸", USD: "$", RUB: "₽", руб: "₽" };
  if (!cur) return "₸";
  if (map[cur]) return map[cur];
  if (cur === "₸" || cur === "$" || cur === "₽") return cur;
  return "₸";
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function waDigits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("8") && d.length === 11) d = "7" + d.slice(1);
  if (d.length === 10) d = "7" + d;
  return d;
}

function ordersLabel(count) {
  if (count === 1) return " заказ";
  if (count < 5) return " заказа";
  return " заказов";
}

const emptyForm = {
  id: "",
  name: "",
  description: "",
  price: "",
  currency: "₸",
  quantity: 1,
  type: "service",
  active: true,
  image: "",
};

export default function AdminPage() {
  const [session, setSession] = useState(() => readSession());
  const authed = Boolean(session && session.token);
  const isAdmin = session && session.role === "admin";
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [catalogReady, setCatalogReady] = useState(false);
  const [params] = useSearchParams();
  const focusOrder = params.get("order") || "";
  const [tab, setTab] = useState("products");
  const [products, setProductList] = useState([]);
  const [hint, setHint] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [crmHint, setCrmHint] = useState("");
  const [clientsHint, setClientsHint] = useState("");

  useEffect(() => {
    document.body.classList.add("admin-body");
    const previous = document.title;
    document.title = "Админка — AI DRONE / CONSTRUCTION";
    return () => {
      document.body.classList.remove("admin-body");
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (!modal) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event) {
      if (event.key === "Escape") setModal(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [modal]);

  async function refreshProducts() {
    const list = await getProducts();
    if (!Array.isArray(list)) {
      setCatalogReady(false);
      setHint("Каталог не загрузился.");
      return;
    }
    setProductList(list);
    setCatalogReady(true);
    setHint("");
  }

  async function refreshCrm() {
    setCrmHint("Загружаю заявки…");
    try {
      const result = await getOrders();
      const nextOrders = Array.isArray(result.orders) ? result.orders : [];
      const nextClients = Array.isArray(result.clients) ? result.clients : clientsFromOrders(nextOrders);
      setOrders(nextOrders);
      setClients(nextClients);
      setCrmHint(result.fromApi ? "" : "Сервер CRM не ответил. Список с этого браузера не подставляется.");
      setClientsHint(
        nextClients.length ? "Один клиент = один телефон, повторные заказы не создают дубль." : "Клиентов пока нет."
      );
    } catch {
      setOrders([]);
      setCrmHint("Не удалось загрузить CRM.");
    }
  }

  useEffect(() => {
    if (!authed) return;
    refreshProducts();
    refreshCrm();
  }, [authed]);

  useEffect(() => {
    if (!authed || !focusOrder) return;
    setTab("crm");
  }, [authed, focusOrder]);

  useEffect(() => {
    if (tab !== "crm" || !focusOrder) return;
    document.getElementById("order-" + focusOrder)?.scrollIntoView({ block: "center" });
  }, [tab, focusOrder, orders]);

  async function login(event) {
    event.preventDefault();
    const next = await loginRequest(password);
    if (!next) {
      setLoginError("Неверный пароль");
      return;
    }
    if (next.error) {
      setLoginError("Вход не настроен. Задайте ADMIN_PASSWORD и MANAGER_PASSWORD.");
      return;
    }
    setSession(next);
    setLoginError("");
    setPassword("");
  }

  function logout() {
    clearSession();
    setSession(null);
    setModal(false);
  }

  function openCreate() {
    setForm(emptyForm);
    setModal(true);
  }

  function openEdit(product) {
    setForm({
      id: product.id,
      name: product.name || "",
      description: product.description || "",
      price: product.price ?? "",
      currency: normalizeCurrency(product.currency),
      quantity: product.quantity ?? 1,
      type: product.type === "product" ? "product" : "service",
      active: product.active !== false,
      image: product.image || "",
    });
    setModal(true);
  }

  async function onImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setHint("Фото слишком большое (макс. 8 МБ).");
      event.target.value = "";
      return;
    }
    setHint("Загружаю фото…");
    try {
      const url = await uploadImage(file);
      setForm((current) => ({ ...current, image: url }));
      setHint("Фото готово.");
    } catch {
      setHint("Не удалось загрузить фото.");
      event.target.value = "";
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!catalogReady) {
      setHint("Сначала дождитесь загрузки каталога.");
      return;
    }
    const next = {
      id: form.id || uid(),
      name: form.name.trim(),
      description: form.description.trim(),
      price: Number(form.price) || 0,
      currency: form.currency || "₸",
      quantity: Number(form.quantity) || 1,
      type: form.type || "service",
      image: form.image,
      active: form.active,
    };
    const list = products.some((item) => item.id === next.id)
      ? products.map((item) => (item.id === next.id ? next : item))
      : [next, ...products];
    setHint("Сохраняю…");
    const result = await setProducts(list);
    if (!result.savedApi) {
      setHint("Не удалось сохранить на сервере.");
      return;
    }
    await refreshProducts();
    setModal(false);
    setHint("Сохранено — товар уже на сайте.");
  }

  async function removeProduct(product) {
    if (!confirm("Удалить «" + product.name + "»?")) return;
    if (!catalogReady) return;
    const list = products.filter((item) => item.id !== product.id);
    const result = await setProducts(list);
    if (!result.savedApi) {
      setHint("Не удалось удалить на сервере.");
      return;
    }
    await refreshProducts();
    setHint("Удалено.");
  }

  async function changeStatus(id, status) {
    const ok = await patchOrder(id, { status });
    if (!ok) {
      setCrmHint("Не удалось обновить статус.");
      return;
    }
    setOrders((list) => list.map((order) => (order.id === id ? { ...order, status } : order)));
  }

  async function downloadPdf(path, filename, setMessage) {
    if (!PDF_BASE) {
      setMessage("PDF-сервис не настроен. Задайте VITE_PDF_BASE.");
      return;
    }
    setMessage("Готовлю PDF…");
    try {
      const res = await fetch(PDF_BASE + path, { headers: { "x-auth-token": (readSession() && readSession().token) || "" } });
      if (!res.ok) {
        setMessage("PDF не собрался. Запустите сервис в services/pdf-generator.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("");
    } catch {
      setMessage("PDF не собрался. Запустите сервис в services/pdf-generator.");
    }
  }

  async function changeNote(id, note, previous) {
    if (previous === note) return;
    const ok = await patchOrder(id, { note });
    if (ok) setOrders((list) => list.map((order) => (order.id === id ? { ...order, note } : order)));
  }

  const fresh = orders.filter((order) => order.status === "new").length;
  const live = orders.filter((order) => order.status === "in_progress" || order.status === "contacted").length;
  const done = orders.filter((order) => order.status === "done").length;

  return (
    <>
      <div className="noise" aria-hidden="true" />
      <header className="admin-top">
        <Link className="nav-mark" to="/">← На сайт</Link>
        <strong>Админка</strong>
        <div className="admin-top-actions">
          <Link className="btn btn-ghost" to="/#shop">Открыть магазин</Link>
          {authed ? <span className="role-pill">{isAdmin ? "Администратор" : "Менеджер"}</span> : null}
          {authed ? (
            <button type="button" className="btn btn-ghost" onClick={logout}>Выйти</button>
          ) : null}
        </div>
      </header>
      <main className="admin-main">
        {!authed ? (
          <section className="admin-card login-card">
            <p className="mono">SECURE / ADMIN</p>
            <h1>Вход</h1>
            <p className="muted">Администратор правит каталог. Менеджер работает с заказами и клиентами.</p>
            <form onSubmit={login}>
              <label>
                Пароль
                <input type="password" autoComplete="current-password" placeholder="пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <button className="btn btn-primary" type="submit">Войти</button>
              {loginError ? <p className="form-error">{loginError}</p> : null}
            </form>
          </section>
        ) : (
          <section>
            <div className="admin-tabs">
              <button type="button" className={`admin-tab${tab === "products" ? " is-on" : ""}`} onClick={() => setTab("products")}>Товары</button>
              <button type="button" className={`admin-tab${tab === "crm" ? " is-on" : ""}`} onClick={() => { setTab("crm"); refreshCrm(); }}>
                Заказы {fresh ? <span className="tab-count">{fresh}</span> : null}
              </button>
              <button type="button" className={`admin-tab${tab === "clients" ? " is-on" : ""}`} onClick={() => setTab("clients")}>
                Клиенты {clients.length ? <span className="tab-count">{clients.length}</span> : null}
              </button>
            </div>

            {tab === "products" ? (
              <div>
                <div className="list-toolbar">
                  <h1>Список</h1>
                  <div className="toolbar-actions">
                    <button type="button" className="btn btn-pdf" onClick={() => downloadPdf("/catalog.pdf", "katalog-uslug.pdf", setHint)}>Каталог PDF</button>
                    {isAdmin ? <button type="button" className="btn btn-accent" disabled={!catalogReady} onClick={openCreate}>+ Новый товар</button> : null}
                  </div>
                </div>
                <p className="save-hint">{hint}</p>
                <div className="product-grid">
                  {products.length === 0 ? (
                    <p className="shop-empty">Пока пусто — нажмите «+ Новый товар».</p>
                  ) : (
                    products.map((product) => {
                      const desc = (product.description || "").length > 90 ? product.description.slice(0, 87) + "…" : product.description || "";
                      return (
                        <article className={`product-tile${product.active === false ? " is-off" : ""}`} key={product.id}>
                          <div className="product-tile-media" style={product.image ? { backgroundImage: cssUrl(product.image) } : undefined}>
                            <span className="product-badge">{product.type === "product" ? "Товар" : "Услуга"}</span>
                            {product.image ? null : "OA"}
                          </div>
                          <div className="product-tile-body">
                            <h3>{product.name}</h3>
                            <div className="price">{formatPrice(product)}</div>
                            <p>{desc}</p>
                            {isAdmin ? (
                              <div className="product-tile-actions">
                                <button type="button" onClick={() => openEdit(product)}>Изменить</button>
                                <button type="button" className="danger" onClick={() => removeProduct(product)}>Удалить</button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            {tab === "crm" ? (
              <div>
                <div className="list-toolbar">
                  <h1>Заказы</h1>
                  <div className="toolbar-actions">
                    <button type="button" className="btn btn-pdf" onClick={refreshCrm}>Обновить</button>
                  </div>
                </div>
                <p className="save-hint">{crmHint}</p>
                <div className="crm-stats">
                  <div className="crm-stat"><span>Новые</span><strong>{fresh}</strong></div>
                  <div className="crm-stat"><span>В работе</span><strong>{live}</strong></div>
                  <div className="crm-stat"><span>Закрыто</span><strong>{done}</strong></div>
                  <div className="crm-stat"><span>Всего</span><strong>{orders.length}</strong></div>
                </div>
                <div className="crm-grid">
                  {orders.length === 0 ? (
                    <p className="shop-empty">Пока нет заказов. Они появятся, когда клиент нажмёт «Заказать» или напишет в чат.</p>
                  ) : (
                    orders.map((order) => {
                      const money = Number(order.price) ? Number(order.price).toLocaleString("ru-RU") + " " + (order.currency || "₸") : "";
                      const wa = waDigits(order.customerPhone);
                      const status = order.status || "new";
                      return (
                        <article className={`crm-card${order.id === focusOrder ? " is-focus" : ""}`} id={"order-" + order.id} key={`${order.id}:${order.note || ""}`}>
                          <div className="crm-card-top">
                            <span className="crm-id">#{String(order.id || "").replace(/^o-/, "").slice(-6)}</span>
                            <span className={`crm-status is-${status}`}>{STATUS_LABEL[status] || status}</span>
                          </div>
                          <h3>{order.productName || order.topic || "Заявка"}</h3>
                          {money ? <p className="crm-card-price">{money}</p> : null}
                          <p className="crm-card-time">
                            {formatWhen(order.createdAt)} · {SOURCE_LABEL[order.source] || order.source || ""} · {CHANNEL_LABEL[order.channel] || order.channel || "WhatsApp"}
                          </p>
                          <p className="crm-card-person">
                            {order.customerName || "Без имени"}
                            {order.customerPhone ? " · " + order.customerPhone : ""}
                            {order.customerEmail ? " · " + order.customerEmail : ""}
                          </p>
                          {Array.isArray(order.items) && order.items.length ? (
                            <p className="crm-card-comment">
                              {order.items.map((item) => item.name + " ×" + (item.qty || 1)).join(", ")}
                            </p>
                          ) : null}
                          {order.comment ? <p className="crm-card-comment">{order.comment}</p> : null}
                          <label className="crm-note-label">
                            Заметка
                            <textarea
                              rows={2}
                              maxLength={800}
                              placeholder="Внутренняя заметка…"
                              defaultValue={order.note || ""}
                              onBlur={(event) => changeNote(order.id, event.target.value, order.note || "")}
                            />
                          </label>
                          <div className="crm-card-actions">
                            <select value={status} onChange={(event) => changeStatus(order.id, event.target.value)}>
                              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                              ))}
                            </select>
                            <div className="action-row">
                              <button type="button" className="btn btn-pdf" onClick={() => downloadPdf("/orders/" + encodeURIComponent(order.id) + ".pdf", "zayavka-" + order.id + ".pdf", setCrmHint)}>Заявка PDF</button>
                              {wa ? (
                                <a className="btn btn-pdf" href={"https://wa.me/" + wa} target="_blank" rel="noreferrer">WhatsApp</a>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            {tab === "clients" ? (
              <div>
                <div className="list-toolbar">
                  <h1>Клиенты</h1>
                  <div className="toolbar-actions">
                    <button type="button" className="btn btn-pdf" onClick={refreshCrm}>Обновить</button>
                  </div>
                </div>
                <p className="save-hint">{clientsHint}</p>
                <div className="crm-grid">
                  {clients.length === 0 ? (
                    <p className="shop-empty">Клиентов пока нет. Они сохраняются автоматически из заказов, без дублей по телефону.</p>
                  ) : (
                    clients.map((client) => {
                      const count = Number(client.ordersCount) || 1;
                      const wa = waDigits(client.phone);
                      return (
                        <article className="crm-card client-card" key={client.id}>
                          <div className="crm-card-top">
                            <h3>{client.name || "Клиент"}</h3>
                            <span className="crm-status is-new">{count}{ordersLabel(count)}</span>
                          </div>
                          <p className="crm-id">{client.id}</p>
                          <p className="crm-card-person">{client.phone || "без телефона"}</p>
                          <p className="crm-card-comment">{client.email || "Email не указан"}</p>
                          <p className="crm-card-time">
                            Последний: {client.lastProduct || "заявка"}
                            {client.lastOrderAt ? " · " + formatWhen(client.lastOrderAt) : ""}
                          </p>
                          <div className="action-row">
                            <button type="button" className="btn btn-pdf" onClick={() => downloadPdf("/clients/" + encodeURIComponent(client.id) + ".pdf", "klient-" + client.id + ".pdf", setClientsHint)}>Карточка PDF</button>
                            {wa ? <a className="btn btn-pdf" href={"https://wa.me/" + wa} target="_blank" rel="noreferrer">WhatsApp</a> : null}
                            <a className="btn btn-pdf" href={TELEGRAM_URL} target="_blank" rel="noreferrer">Telegram</a>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </main>

      {modal ? (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setModal(false)} />
          <div className="modal-panel" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2>{form.id ? "Редактировать" : "Новый товар"}</h2>
              <button type="button" className="modal-close" aria-label="Закрыть" onClick={() => setModal(false)}>×</button>
            </div>
            <form onSubmit={saveProduct}>
              <label>
                Название
                <input type="text" required maxLength={80} placeholder="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <div className="row-2">
                <label>
                  Цена
                  <input type="number" required min="0" step="1" placeholder="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                </label>
                <label>
                  Валюта
                  <select required value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    <option value="₸">Тенге (₸)</option>
                    <option value="$">Доллары ($)</option>
                    <option value="₽">Рубли (₽)</option>
                  </select>
                </label>
              </div>
              <div className="row-2">
                <label>
                  Количество
                  <input type="number" required min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </label>
                <label>
                  Тип
                  <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="product">Товар</option>
                    <option value="service">Услуга</option>
                  </select>
                </label>
              </div>
              <p className="muted">Для услуги это лимит в одном заказе, остаток не списывается. Для товара списывается со склада.</p>
              <label>
                Описание
                <textarea rows={4} maxLength={400} placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <label>
                Фото
                <input type="file" accept="image/*" onChange={onImage} />
              </label>
              {form.image ? <div className="preview" style={{ backgroundImage: cssUrl(form.image) }} /> : null}
              <label className="check">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Показывать на сайте
              </label>
              <div className="form-actions">
                <button className="btn btn-primary" type="submit">Сохранить</button>
                <button className="btn btn-ghost" type="button" onClick={() => setModal(false)}>Отмена</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
