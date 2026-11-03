import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { cartTotals } from "../lib/store";

export default function CartDrawer({ onCheckout }) {
  const { t } = useLang();
  const { items, open, setOpen, setQty, clear } = useCart();
  if (!open) return null;

  const totals = cartTotals(items);

  return (
    <div className="cart-panel">
      <div className="cart-backdrop" onClick={() => setOpen(false)} />
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cartTitle">
        <div className="cart-head">
          <h2 id="cartTitle">{t.cart}</h2>
          <button type="button" className="order-modal-close" aria-label="Закрыть" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="cart-list">
          {items.length === 0 ? (
            <p className="cart-empty">{t.cart_empty}</p>
          ) : (
            items.map((item) => {
              const line = (Number(item.price) || 0) * (Number(item.qty) || 0);
              return (
                <div className="cart-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {line.toLocaleString("ru-RU")} {item.currency || "₸"}
                    </span>
                  </div>
                  <div className="cart-qty">
                    <button type="button" aria-label="-" onClick={() => setQty(item.id, (Number(item.qty) || 1) - 1)}>
                      −
                    </button>
                    <span>{Number(item.qty) || 1}</span>
                    <button
                      type="button"
                      aria-label="+"
                      disabled={(Number(item.qty) || 1) >= (Number(item.maxQty) || 1)}
                      onClick={() => setQty(item.id, (Number(item.qty) || 1) + 1)}
                    >
                      +
                    </button>
                    <button type="button" className="cart-remove" aria-label="Удалить" onClick={() => setQty(item.id, 0)}>
                      ×
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="cart-foot">
          <div className="cart-total-row">
            <span>{t.cart_total}</span>
            <strong>
              {totals.length
                ? totals.map((row) => `${row.total.toLocaleString("ru-RU")} ${row.currency}`).join(" · ")
                : "0 ₸"}
            </strong>
          </div>
          <div className="cart-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!items.length}
              onClick={() => {
                if (!items.length) return;
                setOpen(false);
                onCheckout(items);
              }}
            >
              {t.cart_checkout}
            </button>
            <button type="button" className="btn btn-ghost" onClick={clear}>
              {t.cart_clear}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
