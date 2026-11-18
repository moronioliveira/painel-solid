/**
 * Nomes das métricas. "team" é o painel do gestor (termos do Google Ads);
 * "client" é o relatório do cliente, em palavras de quem nunca abriu o Google Ads.
 */
export type Audience = "team" | "client";

export const TERMS = {
  team: {
    conversions: "Conversões",
    costPer: "Custo por conversão",
    clicks: "Cliques",
    impressions: "Impressões",
    invested: "Investido",
    clickShare: (p: string) => `${p} de quem viu clicou`,
    conversionsPerDay: "Conversões por dia",
    compareWith: "Variações em relação a",
  },
  client: {
    conversions: "Contatos",
    costPer: "Custo por contato",
    clicks: "Visitas ao site",
    impressions: "Vezes que apareceu",
    invested: "Investido",
    clickShare: (p: string) => `${p} de quem viu o anúncio entrou`,
    conversionsPerDay: "Contatos por dia",
    compareWith: "As setas comparam com",
  },
} as const;
