import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { EMAIL, TELEGRAM_HANDLE, TELEGRAM_URL } from "../lib/contacts";
import { useLang } from "../context/LangContext";
import { useCart } from "../context/CartContext";
import Nav from "../components/Nav";
import Shop from "../components/Shop";
import CartDrawer from "../components/CartDrawer";
import OrderModal from "../components/OrderModal";
import ChatWidget from "../components/ChatWidget";

const CARDS = [
  ["01", "c1_h", "c1_p"],
  ["02", "c2_h", "c2_p"],
  ["03", "c3_h", "c3_p"],
  ["04", "c4_h", "c4_p"],
];

export default function HomePage() {
  const { t } = useLang();
  const { open, setOpen } = useCart();
  const { hash } = useLocation();
  const [checkout, setCheckout] = useState(null);

  useEffect(() => {
    document.title = "AI DRONE / CONSTRUCTION";
  }, []);

  useEffect(() => {
    if (!hash || hash === "#") return;
    try {
      document.querySelector(hash)?.scrollIntoView();
    } catch {
      /* ignore a hash that is not a selector */
    }
  }, [hash]);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (checkout) setCheckout(null);
      else if (open) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [checkout, open, setOpen]);

  useEffect(() => {
    document.body.style.overflow = open || checkout ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, checkout]);

  return (
    <>
      <div className="noise" aria-hidden="true" />
      <div className="hud-frame" aria-hidden="true">
        <span className="hud-corner hud-tl" />
        <span className="hud-corner hud-tr" />
        <span className="hud-corner hud-bl" />
        <span className="hud-corner hud-br" />
      </div>
      <Nav />
      <main id="top">
        <section className="hero">
          <div className="hero-meta">
            <p className="mono blink">{t.hero_status}</p>
            <p className="mono">{t.hero_loc}</p>
          </div>
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">{t.hero_eyebrow}</p>
              <h1>
                <span className="name-last">ОЙРАТ</span>
                <span className="name-rest">Арман Талгатович</span>
              </h1>
              <p className="lead">{t.hero_lead}</p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="#contact">{t.hero_btn1}</a>
                <a className="btn btn-ghost" href="#startup">{t.hero_btn2}</a>
              </div>
            </div>
            <aside className="hero-panel" aria-hidden="true">
              <div className="scan-box">
                <div className="scan-line" />
                <svg className="site-svg" viewBox="0 0 320 360" fill="none">
                  <path className="trace" d="M40 300 L40 140 L110 90 L180 140 L180 300 Z" />
                  <path className="trace delay" d="M180 300 L180 150 L250 110 L280 140 L280 300 Z" />
                  <path className="trace delay2" d="M70 300 L70 200 L140 160 L140 300" />
                  <g className="drone-g">
                    <circle cx="160" cy="70" r="10" className="drone" />
                    <path className="drone-arm" d="M128 70 L192 70 M160 42 L160 98" />
                    <path className="drone-arm" d="M134 54 L186 86 M186 54 L134 86" />
                  </g>
                  <path className="beam" d="M160 100 L90 280 M160 100 L230 280" />
                </svg>
                <div className="hud-readout">
                  <span>ALT 42.0</span>
                  <span>QC SCAN</span>
                  <span>AI 94%</span>
                </div>
              </div>
            </aside>
          </div>
          <dl className="stats">
            <div>
              <dt>{t.stat1_l}</dt>
              <dd>{t.stat1_v}</dd>
            </div>
            <div>
              <dt>{t.stat2_l}</dt>
              <dd>{t.stat2_v}</dd>
            </div>
            <div>
              <dt>{t.stat3_l}</dt>
              <dd>{t.stat3_v}</dd>
            </div>
          </dl>
        </section>

        <section id="about" className="section">
          <div className="section-head">
            <span className="mono">02 / ABOUT</span>
            <h2>{t.about_h}</h2>
          </div>
          <div className="about-grid">
            <p className="about-text">{t.about_p1}</p>
            <p className="about-text">{t.about_p2}</p>
          </div>
        </section>

        <section id="work" className="section">
          <div className="section-head">
            <span className="mono">03 / PRACTICE</span>
            <h2>{t.work_h}</h2>
          </div>
          <ul className="cards">
            {CARDS.map(([num, title, body]) => (
              <li key={num}>
                <span className="mono">{num}</span>
                <h3>{t[title]}</h3>
                <p>{t[body]}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="startup" className="section startup">
          <div className="section-head">
            <span className="mono">04 / NOW</span>
            <h2>{t.st_h}</h2>
          </div>
          <div className="startup-grid">
            <div>
              <p className="startup-lead">{t.st_p}</p>
              <ol className="steps">
                <li>
                  <strong>{t.st_s1h}</strong>
                  <span>{t.st_s1p}</span>
                </li>
                <li>
                  <strong>{t.st_s2h}</strong>
                  <span>{t.st_s2p}</span>
                </li>
                <li>
                  <strong>{t.st_s3h}</strong>
                  <span>{t.st_s3p}</span>
                </li>
              </ol>
            </div>
            <aside className="ticket">
              <p className="mono">MISSION BRIEF</p>
              <h3>{t.st_t}</h3>
              <p>{t.st_tp}</p>
              <a className="btn btn-primary" href="#contact">{t.st_btn}</a>
            </aside>
          </div>
        </section>

        <Shop />

        <section id="contact" className="section contact">
          <div className="section-head">
            <span className="mono">06 / CONTACT</span>
            <h2>{t.ct_h}</h2>
          </div>
          <p className="contact-lead">{t.ct_p}</p>
          <div className="contact-row">
            <a className="contact-link" href={TELEGRAM_URL} target="_blank" rel="noreferrer">
              <span className="mono">01</span>
              Telegram
              <small>{TELEGRAM_HANDLE}</small>
            </a>
            <a className="contact-link" href={"mailto:" + EMAIL}>
              <span className="mono">02</span>
              Email
              <small>{EMAIL}</small>
            </a>
          </div>
        </section>
      </main>
      <footer className="foot">
        <p>© {new Date().getFullYear()} AI Drone Construction · Ойрат Арман Талгатович</p>
        <p className="mono">AI + DRONES FOR CONSTRUCTION QC</p>
      </footer>
      <CartDrawer onCheckout={(items) => setCheckout(items.map((item) => ({ ...item })))} />
      <OrderModal items={checkout} onClose={() => setCheckout(null)} />
      <ChatWidget />
    </>
  );
}
