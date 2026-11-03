import { useEffect, useState } from "react";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import { cartCount } from "../lib/store";

export default function Nav() {
  const { lang, t, toggle } = useLang();
  const { items, setOpen } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const count = cartCount(items);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);
    return () => document.body.classList.remove("menu-open");
  }, [menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="nav">
      <a className="nav-mark" href="#top" onClick={closeMenu}>
        <img className="nav-favicon" src="/favicon.png" alt="" width="28" height="28" />
        AI DRONE / CONSTRUCTION
      </a>
      <nav className="nav-links">
        <a href="#about" onClick={closeMenu}>{t.nav_about}</a>
        <a href="#work" onClick={closeMenu}>{t.nav_work}</a>
        <a href="#startup" onClick={closeMenu}>{t.nav_startup}</a>
        <a href="#shop" onClick={closeMenu}>{t.nav_shop}</a>
        <a href="#contact" onClick={closeMenu}>{t.nav_contact}</a>
      </nav>
      <div className="nav-right">
        <button className="lang" type="button" aria-label="Switch language" onClick={toggle}>
          {lang === "ru" ? (
            <>
              <span className="lang-active">RU</span>
              <span>/</span>
              <span>EN</span>
            </>
          ) : (
            <>
              <span>RU</span>
              <span>/</span>
              <span className="lang-active">EN</span>
            </>
          )}
        </button>
        <button type="button" className={`cart-fab-nav${count ? " has-items" : ""}`} aria-label={t.cart} onClick={() => setOpen(true)}>
          {t.cart}
          {count > 0 ? <span className="cart-count">{count}</span> : null}
        </button>
        <a className="nav-cta" href="#contact" onClick={closeMenu}>
          {t.nav_cta}
        </a>
      </div>
      <button className="menu-btn" type="button" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>
        <span></span>
        <span></span>
      </button>
    </header>
  );
}
