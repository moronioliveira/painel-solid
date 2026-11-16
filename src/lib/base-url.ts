import { headers } from "next/headers";

/** Endereço público do painel. Defina APP_URL em produção para não depender do cabeçalho Host. */
export async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export const isLocalUrl = (url: string) => /\/\/(localhost|127\.|192\.168\.|10\.)/.test(url);
