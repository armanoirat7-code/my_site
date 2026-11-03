import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { copy } from "../copy";

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState("ru");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      t: copy[lang],
      toggle: () => setLang((current) => (current === "ru" ? "en" : "ru")),
    }),
    [lang]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang outside provider");
  return ctx;
}
