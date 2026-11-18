"use client";

import { useState } from "react";

/**
 * Troca entre tema claro e escuro na hora, sem recarregar, e guarda a escolha num cookie
 * por um ano para as próximas visitas (o servidor já entrega a página no tema certo).
 */
export function ThemeToggle({ initial, targetId }: { initial: "light" | "dark"; targetId: string }) {
  const [theme, setTheme] = useState(initial);
  const next = theme === "dark" ? "light" : "dark";
  function toggle() {
    document.getElementById(targetId)?.classList.toggle("theme-dark", next === "dark");
    document.cookie = `ps_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="tap inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 text-white/65 hover:text-white"
      aria-label={next === "dark" ? "Usar tema escuro" : "Usar tema claro"}
      title={next === "dark" ? "Tema escuro" : "Tema claro"}
    >
      {next === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
      <span className="hidden text-sm lg:inline">{next === "dark" ? "Escuro" : "Claro"}</span>
    </button>
  );
}
