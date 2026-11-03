import { useEffect, useRef, useState } from "react";
import { PHONE_DISPLAY, TELEGRAM_HANDLE, TELEGRAM_URL } from "../lib/contacts";
import { normalizePhone } from "../lib/phone";
import { saveOrder, WHATSAPP_NUMBER } from "../lib/store";

const SIZE_KEY = "adc-chat-size";

function waLink(topic) {
  const body =
    "Здравствуйте, Арман! Пишу с сайта AI Drone Construction.\nИнтересует: " +
    String(topic || "консультация").slice(0, 280);
  return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(body);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      const scale = Math.min(1, maxSide / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img"));
    };
    img.src = url;
  });
}

function HandoffCard({ topic }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [hint, setHint] = useState("");

  async function open(channel) {
    if (name.trim().length < 2) {
      setHint("Укажите имя.");
      return;
    }
    if (normalizePhone(phone).length < 11) {
      setHint("Укажите телефон.");
      return;
    }
    setHint("Сохраняю заявку…");
    const saved = await saveOrder({
      source: "chat",
      productName: topic,
      topic,
      customerName: name.trim(),
      customerPhone: phone.trim(),
      channel,
    });
    if (!saved || saved.ok === false) {
      setHint("Не удалось сохранить заявку. Попробуйте ещё раз.");
      return;
    }
    setHint("");
    const url = channel === "whatsapp" ? waLink(topic) : TELEGRAM_URL;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="chat-handoff">
      <p className="chat-handoff-title">Связаться с Арманом</p>
      <p className="chat-handoff-sub">Оставьте контакты — заявка попадёт в CRM, затем откроется мессенджер</p>
      <label className="chat-lead-field">
        Имя
        <input type="text" maxLength={80} placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="chat-lead-field">
        Телефон
        <input type="tel" maxLength={20} placeholder="+7 700 000 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      {hint ? <p className="chat-lead-hint">{hint}</p> : null}
      <div className="chat-handoff-actions">
        <button type="button" className="chat-handoff-btn wa" onClick={() => open("whatsapp")}>WhatsApp</button>
        <button type="button" className="chat-handoff-btn tg" onClick={() => open("telegram")}>Telegram</button>
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const panelRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const historyRef = useRef([]);
  const greeted = useRef(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    try {
      const raw = localStorage.getItem(SIZE_KEY);
      if (!raw) return;
      const size = JSON.parse(raw);
      if (size.width) panelRef.current.style.width = size.width + "px";
      if (size.height) panelRef.current.style.height = size.height + "px";
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClick(event) {
      const root = document.getElementById("chatWidget");
      if (!root || root.contains(event.target) || event.target.closest("#orderModal")) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  function pushMessage(message) {
    setMessages((list) => [...list, { id: Date.now() + Math.random(), ...message }]);
  }

  function openChat() {
    setOpen(true);
    if (!greeted.current) {
      greeted.current = true;
      pushMessage({
        role: "bot",
        text: "Здравствуйте! Я AI-консультант. Могу ответить текстом, разобрать файл или фото (кнопка +). По цене и заказу переведу к Арману.",
      });
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function startResize(event, mode) {
    event.preventDefault();
    event.stopPropagation();
    const panel = panelRef.current;
    if (!panel) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = panel.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;
    const minW = 280;
    const maxW = Math.min(560, window.innerWidth - 24);
    const minH = 320;
    const maxH = Math.min(720, window.innerHeight - 96);

    function onMove(ev) {
      if (mode === "left" || mode === "both") {
        panel.style.width = Math.min(maxW, Math.max(minW, startW + (startX - ev.clientX))) + "px";
      }
      if (mode === "top" || mode === "both") {
        panel.style.height = Math.min(maxH, Math.max(minH, startH + (startY - ev.clientY))) + "px";
      }
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      const next = panel.getBoundingClientRect();
      localStorage.setItem(SIZE_KEY, JSON.stringify({ width: Math.round(next.width), height: Math.round(next.height) }));
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  async function ingestFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, 3);
    const next = [];
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        pushMessage({ role: "bot", text: "Файл «" + file.name + "» слишком большой (макс. 8 МБ)." });
        continue;
      }
      const isImage = /^image\//i.test(file.type) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name);
      const isText = /^text\//i.test(file.type) || /\.(txt|md|csv|json|html?|css|js|ts|xml|log)$/i.test(file.name);
      if (isImage) {
        let dataUrl;
        try {
          dataUrl = await compressImage(file, 1280, 0.72);
        } catch {
          dataUrl = await readAsDataUrl(file);
        }
        next.push({ kind: "image", name: file.name, dataUrl });
      } else if (isText) {
        const body = (await readAsText(file)).slice(0, 12000);
        next.push({ kind: "text", name: file.name, text: body });
      } else {
        pushMessage({ role: "bot", text: "Можно прикрепить изображение или текстовый файл до 8 МБ." });
      }
    }
    setPending((list) => [...list, ...next]);
  }

  function buildUserContent(value, files) {
    const parts = [];
    const captions = [];
    if (value) captions.push(value);
    files.forEach((file) => {
      if (file.kind === "image" && file.dataUrl) {
        parts.push({ type: "image_url", image_url: { url: file.dataUrl } });
        captions.push("Прикреплено изображение: " + file.name);
      } else if (file.kind === "text") {
        captions.push("Содержимое файла «" + file.name + "»:\n```\n" + (file.text || "").slice(0, 8000) + "\n```");
      } else {
        captions.push(
          "Прикреплён файл «" + file.name + "» (" + (file.mime || "file") + ", " + Math.round((file.size || 0) / 1024) + " КБ). Опиши, что с ним сделать, если содержимое не читается."
        );
      }
    });
    const joined = captions.join("\n\n").trim() || "Посмотри вложение.";
    if (!parts.length) return joined;
    return [{ type: "text", text: joined }, ...parts];
  }

  async function askViaApi(messages) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) throw new Error("api");
    const data = await res.json();
    if (!data.reply) throw new Error("empty");
    return { reply: data.reply, actions: Array.isArray(data.actions) ? data.actions : [] };
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (busy) return;
    const value = text.trim();
    const files = pending;
    if (!value && !files.length) return;
    setText("");
    setPending([]);
    const fileLabel = files.length
      ? files.length === 1
        ? "📎 " + files[0].name
        : "📎 " + files.map((file) => file.name).join(", ")
      : "";
    pushMessage({
      role: "user",
      text: value || (files.length ? "Вложение" : ""),
      imageUrl: files[0]?.kind === "image" ? files[0].dataUrl : "",
      fileLabel,
    });
    const typingId = "typing-" + Date.now();
    setMessages((list) => [...list, { id: typingId, role: "bot", text: "…", typing: true }]);
    setBusy(true);
    try {
      const content = buildUserContent(value, files);
      historyRef.current.push({ role: "user", content });
      const slim = historyRef.current.slice(-8).map((item) => ({ role: item.role, content: item.content }));
      let reply;
      let actions = [];
      try {
        const data = await askViaApi(slim);
        reply = data.reply;
        actions = data.actions;
        historyRef.current.push({ role: "assistant", content: reply });
      } catch {
        historyRef.current.pop();
        reply = "Сервис консультанта сейчас недоступен. Напишите в WhatsApp или Telegram ниже — это живой контакт, не ответ ИИ.";
      }
      const handoffAction = actions.find((item) => item && item.type === "handoff");
      const handoff = Boolean(handoffAction);
      const topic =
        (handoffAction && String(handoffAction.topic || "").trim()) || value || files[0]?.name || "заявка";
      setMessages((list) =>
        list
          .map((item) => (item.id === typingId ? { ...item, text: reply, typing: false } : item))
          .concat(handoff ? [{ id: "hand-" + Date.now(), role: "handoff", topic }] : [])
      );
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="chat-widget" id="chatWidget">
      {open ? (
        <div className="chat-panel" ref={panelRef}>
          <div className="chat-resize chat-resize-left" title="Тяните: ширина и высота" onPointerDown={(event) => startResize(event, "both")} />
          <div className="chat-resize chat-resize-top" title="Тяните для высоты" onPointerDown={(event) => startResize(event, "top")} />
          <div className="chat-panel-head">
            <div>
              <strong>AI-консультант</strong>
              <p>Отвечу сам или переведу к Арману</p>
            </div>
            <button type="button" className="chat-close" aria-label="Закрыть" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <div className="chat-messages" role="log" aria-live="polite" ref={logRef}>
            {messages.map((message) =>
              message.role === "handoff" ? (
                <HandoffCard key={message.id} topic={message.topic} />
              ) : (
                <div key={message.id} className={`chat-msg chat-msg--${message.role}${message.typing ? " chat-msg--typing" : ""}`}>
                  {message.imageUrl ? <img src={message.imageUrl} alt="вложение" className="chat-msg-img" /> : null}
                  {message.fileLabel ? <div className="chat-msg-file">{message.fileLabel}</div> : null}
                  {message.text ? <div>{message.text}</div> : null}
                </div>
              )
            )}
          </div>
          {pending.length ? (
            <div className="chat-attach-preview">
              {pending.map((file, index) => (
                <div className="chat-attach-chip" key={file.name + index}>
                  {file.kind === "image" && file.dataUrl ? <img src={file.dataUrl} alt={file.name} /> : null}
                  <span>{file.name}</span>
                  <button type="button" aria-label="Убрать" onClick={() => setPending((list) => list.filter((_, i) => i !== index))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <form className="chat-form" autoComplete="off" onSubmit={onSubmit}>
            <button type="button" className="chat-plus" aria-label="Прикрепить файл или изображение" disabled={busy} onClick={() => fileRef.current?.click()}>
              +
            </button>
            <input
              ref={fileRef}
              type="file"
              className="chat-file"
              accept="*/*"
              multiple
              hidden
              onChange={async (event) => {
                const list = event.target.files;
                event.target.value = "";
                if (!list?.length) return;
                setBusy(true);
                try {
                  await ingestFiles(list);
                } finally {
                  setBusy(false);
                  inputRef.current?.focus();
                }
              }}
            />
            <input
              ref={inputRef}
              type="text"
              className="chat-input"
              placeholder="Напишите сообщение…"
              maxLength={500}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" className="chat-send" aria-label="Отправить" disabled={busy}>
              →
            </button>
          </form>
          <div className="chat-quick">
            <a
              className="chat-channel wa"
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Здравствуйте! Пишу с сайта.")}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="chat-ico" aria-hidden="true">WA</span>
              <span>
                <b>WhatsApp</b>
                <small>{PHONE_DISPLAY}</small>
              </span>
            </a>
            <a
              className="chat-channel tg"
              href={TELEGRAM_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span className="chat-ico" aria-hidden="true">TG</span>
              <span>
                <b>Telegram</b>
                <small>{TELEGRAM_HANDLE}</small>
              </span>
            </a>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`chat-fab${open ? " is-open" : ""}`}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (open) setOpen(false);
          else openChat();
        }}
      >
        <span className="chat-fab-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4 3.5V6.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="chat-fab-label">Чат</span>
      </button>
    </div>
  );
}
