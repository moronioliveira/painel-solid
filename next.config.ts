import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas as telas dependem do usuário logado e de dados que mudam todo dia,
  // então nada é pré-renderizado: o modelo de cache antigo (tudo dinâmico) é o que serve aqui.
  cacheComponents: false,
  // O Postgres embutido (modo local) carrega arquivos .wasm e não pode ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // A importação de CSV passa por uma server action.
    serverActions: { bodySizeLimit: "8mb" },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // Tudo menos a demonstração fica proibido de abrir dentro de outro site.
        source: "/:path((?!demo(?:/|$)).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        // A demonstração (dados fictícios) pode ser incorporada na landing page com <iframe>.
        source: "/demo",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Relatórios são links privados: não devem aparecer em buscadores.
        source: "/r/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
