import type { Metadata } from "next";
import "./globals.css";

/**
 * Tempo máximo de cada página no servidor. Se o banco travar, a pessoa vê um erro em 1 minuto
 * em vez de a tela ficar carregando até o limite da Vercel (5 minutos).
 */
export const maxDuration = 60;

export const metadata: Metadata = {
  title: { default: "Painel Solid", template: "%s · Painel Solid" },
  description: "Painel de clientes de Google Ads da Solid Solutions.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
