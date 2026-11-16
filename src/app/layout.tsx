import type { Metadata } from "next";
import "./globals.css";

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
