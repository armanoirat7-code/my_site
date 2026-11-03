import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CART_KEY, addToCart, clearCart, getProducts, loadCart, setCartQty, syncCart } from "../lib/store";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function refresh() {
      setItems(loadCart());
    }
    function onStorage(event) {
      if (event.key === CART_KEY) refresh();
    }
    window.addEventListener("oirat-cart-change", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("oirat-cart-change", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    let live = true;
    getProducts().then((list) => {
      if (!live || !Array.isArray(list)) return;
      setItems(syncCart(list));
    });
    return () => {
      live = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      items,
      open,
      setOpen,
      add(product) {
        setItems(addToCart(product));
      },
      setQty(id, qty) {
        setItems(setCartQty(id, qty));
      },
      clear() {
        setItems(clearCart());
      },
    }),
    [items, open]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart outside provider");
  return ctx;
}
