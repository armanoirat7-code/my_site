import { useEffect, useState } from "react";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { formatPhoneInput, isValidEmail, normalizePhone } from "../lib/phone";
import { cartItemsText, cartTotals, orderLink, saveOrder } from "../lib/store";

export default function OrderModal({ items, onClose }) {
  const { t } = useLang();
  const { clear } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [hint, setHint] = useState("");
  const [hintOk, setHintOk] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (items?.length) return;
    setName("");
    setPhone("");
    setEmail("");
    setComment("");
    setHint("");
    setHintOk(false);
    setSending(false);
  }, [items]);

  if (!items?.length) return null;

  const totals = cartTotals(items);
  const totalText = totals.length
    ? totals.map((row) => `${row.total.toLocaleString("ru-RU")} ${row.currency}`).join(" · ")
    : "0 ₸";
  const title = items.length === 1 ? items[0].name : t.order_title_many(items.length);

  async function onSubmit(event) {
    event.preventDefault();
    if (sending) return;
    const phoneNorm = normalizePhone(phone);
    if (name.trim().length < 2) {
      setHintOk(false);
      setHint(t.err_name);
      return;
    }
    if (phoneNorm.length < 11) {
      setHintOk(false);
      setHint(t.err_phone);
      return;
    }
    if (!isValidEmail(email)) {
      setHintOk(false);
      setHint(t.err_email);
      return;
    }

    setSending(true);
    setHintOk(false);
    setHint(t.saving);

    const saved = await saveOrder({
      source: "shop",
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerEmail: email.trim(),
      comment: comment.trim(),
      channel: "whatsapp",
      items: items.map((item) => ({
        productId: item.id,
        qty: Number(item.qty) || 1,
      })),
    });
    if (!saved || saved.ok === false || !saved.order) {
      const code = saved && saved.error;
      setHintOk(false);
      setHint(
        code === "not_enough" || code === "unknown_product"
          ? t.err_stock
          : code === "bad_phone"
            ? t.err_phone
            : code === "bad_name"
              ? t.err_name
              : code === "bad_email"
                ? t.err_email
                : t.err_save
      );
      setSending(false);
      return;
    }
    const order = saved.order;
    const wa = orderLink(order.productName || title, {
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerEmail: email.trim(),
      comment: comment.trim(),
      itemsText: cartItemsText(order.items && order.items.length ? order.items : items),
    });
    clear();
    setHintOk(true);
    setHint(t.saved);
    window.setTimeout(() => {
      onClose();
      const popup = window.open(wa, "_blank", "noopener,noreferrer");
      if (!popup) window.location.href = wa;
    }, 450);
  }

  return (
    <div className="order-modal" id="orderModal">
      <div className="order-modal-backdrop" onClick={onClose} />
      <div className="order-modal-panel" role="dialog" aria-modal="true" aria-labelledby="orderProductTitle">
        <div className="order-modal-head">
          <p className="mono">{t.order_kicker}</p>
          <button type="button" className="order-modal-close" aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        </div>
        <h2 id="orderProductTitle">{title}</h2>
        <p className="order-modal-price">{totalText}</p>
        <pre className="order-items-summary">{cartItemsText(items)}</pre>
        <form onSubmit={onSubmit}>
          <label>
            <span>{t.order_name}</span>
            <input
              type="text"
              required
              maxLength={80}
              autoComplete="name"
              placeholder="Арман"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <span>{t.order_phone}</span>
            <input
              type="tel"
              required
              maxLength={20}
              autoComplete="tel"
              inputMode="tel"
              placeholder="+7 700 000 00 00"
              value={phone}
              onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
            />
          </label>
          <label>
            <span>{t.order_email}</span>
            <input
              type="email"
              maxLength={120}
              autoComplete="email"
              placeholder="name@company.kz"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>{t.order_comment}</span>
            <textarea
              rows={3}
              maxLength={400}
              placeholder="Объект, сроки, детали"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <p className="order-modal-note">{t.order_note}</p>
          <p className="order-modal-hint" style={hintOk ? { color: "#8dffb0" } : undefined}>
            {hint}
          </p>
          <div className="order-modal-actions">
            <button className="btn btn-primary" type="submit" disabled={sending}>
              {t.order_submit}
            </button>
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              {t.order_cancel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
