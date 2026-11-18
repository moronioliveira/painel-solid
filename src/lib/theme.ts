import { cookies } from "next/headers";

/** Tema do painel. Claro é o padrão; a pessoa escolhe o escuro pelo botão do topo. */
export type Theme = "light" | "dark";
export const THEME_COOKIE = "ps_theme";

export async function getTheme(): Promise<Theme> {
  return (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
}

/** Classe que liga o tema escuro (as cores ficam em globals.css). */
export const themeClass = (t: Theme) => (t === "dark" ? "theme-dark" : "");
