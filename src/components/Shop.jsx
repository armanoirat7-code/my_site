import { useEffect, useState } from "react";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { cssUrl, formatPrice, getProducts, syncCart } from "../lib/store";

export default function Shop() {
  const { t } = useLang();
  const { add } = useCart();
  const [products, setProducts] = useState([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let live = true;
    getProducts().then((list) => {
      if (!live) return;
      if (!Array.isArray(list)) {
        setFailed(true);
        setReady(true);
        return;
      }
      syncCart(list);
      setProducts(list);
      setFailed(false);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const active = products.filter((product) => product.active !== false);

  return (
    <section id="shop" className="section shop">
      <div className="section-head">
        <span className="mono">05 / SHOP</span>
        <h2>{t.shop_h}</h2>
      </div>
      <p className="shop-lead">{t.shop_p}</p>
      <div className="shop-grid" aria-live="polite">
        {!ready ? null : failed ? (
          <p className="shop-empty">{t.shop_down}</p>
        ) : active.length === 0 ? (
          <p className="shop-empty">{t.shop_empty}</p>
        ) : (
          active.map((product) => (
            <article className="product-card" key={product.id}>
              <div
                className="product-media"
                style={product.image ? { backgroundImage: cssUrl(product.image) } : undefined}
              >
                <span className="shop-badge">
                  {product.type === "product" ? t.product : t.service}
                </span>
                {product.image ? null : <span className="product-placeholder" />}
              </div>
              <div className="product-body">
                <h3>{product.name}</h3>
                <p>{product.description || ""}</p>
                <div className="product-foot">
                  <strong>{formatPrice(product)}</strong>
                  <button
                    type="button"
                    className="btn btn-ghost product-buy"
                    disabled={(Number(product.quantity) || 0) < 1}
                    onClick={() => {
                      add(product);
                      setToast(t.cart_added);
                    }}
                  >
                    {(Number(product.quantity) || 0) < 1 ? t.sold_out : t.buy}
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      {toast ? <div className="cart-toast">{toast}</div> : null}
    </section>
  );
}
