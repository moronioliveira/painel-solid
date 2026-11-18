import Link from "next/link";
import type { TermSummary } from "@/lib/ads-extras";
import { WASTE_MIN_COST } from "@/lib/ads-extras";
import { brl, conv, fullDate, int } from "@/lib/format";

const LEVEL: Record<string, { text: string; className: string }> = {
  BELOW_AVERAGE: { text: "Abaixo da média", className: "text-critical-ink" },
  AVERAGE: { text: "Na média", className: "text-ink-2" },
  ABOVE_AVERAGE: { text: "Acima da média", className: "text-good-ink" },
};
const MATCH: Record<string, string> = { EXACT: "Exata", PHRASE: "Frase", BROAD: "Ampla" };
const STATUS: Record<string, string> = { ENABLED: "Ativa", HIDDEN: "Oculta", REMOVED: "Removida" };

function Level({ value }: { value: string | null }) {
  const l = value ? LEVEL[value] : undefined;
  return l ? <span className={l.className}>{l.text}</span> : <span className="text-ink-3">—</span>;
}

export function ScriptUpdateHint({ clientId }: { clientId: string }) {
  return (
    <section className="panel mt-10 px-5 py-4 text-sm leading-relaxed">
      <h2 className="font-semibold">Termos de pesquisa, palavras-chave e medição</h2>
      <p className="mt-1 max-w-[70ch] text-ink-2">
        Este cliente ainda usa o script antigo. Cole o script atualizado no Google Ads para ver os termos pesquisados, o índice de qualidade,
        quanto a verba limita as campanhas e se a conversão está ligada.
      </p>
      <Link href={`/clientes/${clientId}/config#envio`} className="mt-3 inline-block underline underline-offset-2">Pegar o script atualizado</Link>
    </section>
  );
}

export function SearchTermsSection({ terms, periodLabel }: { terms: TermSummary[]; periodLabel: string }) {
  const wasted = terms.filter((t) => t.wasted);
  const wastedCost = wasted.reduce((a, t) => a + t.cost, 0);
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Termos de pesquisa</h2>
      <p className="mt-1 mb-3 max-w-[70ch] text-sm leading-relaxed text-ink-2">
        O que as pessoas digitaram no Google antes de clicar, {periodLabel}. Só aparecem buscas com pelo menos um clique.
      </p>
      {terms.length === 0 ? (
        <p className="panel px-5 py-6 text-sm text-ink-2">Nenhuma busca com clique neste período.</p>
      ) : (
        <>
          {wasted.length > 0 && (
            <p className="mb-3 max-w-[70ch] rounded-md border border-warning bg-warning/10 px-4 py-2.5 text-sm leading-relaxed">
              <strong>{brl(wastedCost)}</strong> foram gastos em {wasted.length} {wasted.length === 1 ? "busca" : "buscas"} sem nenhuma conversão (pelo menos{" "}
              {brl(WASTE_MIN_COST)} cada). Veja se vale adicionar como palavra negativa.
            </p>
          )}
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="th pl-5">Busca</th>
                  <th className="th text-right">Cliques</th>
                  <th className="th text-right">Custo</th>
                  <th className="th pr-5 text-right">Conversões</th>
                </tr>
              </thead>
              <tbody>
                {terms.slice(0, 30).map((t) => (
                  <tr key={t.term} className="border-b border-line last:border-0">
                    <td className="td pl-5">
                      {t.term}
                      {t.wasted && <span className="ml-2 rounded border border-warning px-1.5 py-0.5 text-[12px] text-ink-2">gasto sem conversão</span>}
                    </td>
                    <td className="td num text-right">{int(t.clicks)}</td>
                    <td className="td num text-right">{brl(t.cost)}</td>
                    <td className="td num pr-5 text-right">{conv(t.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {terms.length > 30 && <p className="mt-2 text-[13px] text-ink-3">Mostrando as 30 buscas com mais gasto de {terms.length}.</p>}
        </>
      )}
    </section>
  );
}

type Keyword = {
  keywordId: string;
  text: string;
  matchType: string;
  campaignName: string;
  qualityScore: number | null;
  adRelevance: string | null;
  landingPage: string | null;
  expectedCtr: string | null;
  clicks: number;
  cost: number;
  conversions: number;
};

export function KeywordsSection({ keywords }: { keywords: Keyword[] }) {
  const sorted = [...keywords].sort(
    (a, b) => (a.qualityScore ?? 99) - (b.qualityScore ?? 99) || b.cost - a.cost,
  );
  const low = keywords.filter((k) => k.qualityScore !== null && k.qualityScore <= 5).length;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Palavras-chave e índice de qualidade</h2>
      <p className="mt-1 mb-3 max-w-[70ch] text-sm leading-relaxed text-ink-2">
        Últimos 30 dias, só palavras com impressão. Índice baixo encarece o clique; os três componentes mostram onde mexer.
        {low > 0 && <> <strong className="text-ink">{low}</strong> com índice 5 ou menos.</>}
      </p>
      {keywords.length === 0 ? (
        <p className="panel px-5 py-6 text-sm text-ink-2">Nenhuma palavra-chave teve impressão nos últimos 30 dias.</p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="th pl-5">Palavra-chave</th>
                <th className="th text-right">Índice</th>
                <th className="th">Relevância do anúncio</th>
                <th className="th">Página de destino</th>
                <th className="th">CTR esperada</th>
                <th className="th text-right">Custo</th>
                <th className="th pr-5 text-right">Conversões</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 40).map((k) => (
                <tr key={k.keywordId} className="border-b border-line last:border-0">
                  <td className="td max-w-[280px] pl-5">
                    <div className="font-medium">{k.text}</div>
                    <div className="text-[13px] text-ink-3">{MATCH[k.matchType] ?? k.matchType} · {k.campaignName}</div>
                  </td>
                  <td className={`td num text-right font-semibold ${k.qualityScore !== null && k.qualityScore <= 5 ? "text-critical-ink" : ""}`}>
                    {k.qualityScore ?? <span className="font-normal text-ink-3">—</span>}
                  </td>
                  <td className="td"><Level value={k.adRelevance} /></td>
                  <td className="td"><Level value={k.landingPage} /></td>
                  <td className="td"><Level value={k.expectedCtr} /></td>
                  <td className="td num text-right">{brl(k.cost)}</td>
                  <td className="td num pr-5 text-right">{conv(k.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type Action = { actionId: string; name: string; status: string; category: string; primary: boolean; conversions30d: number; lastConversionDate: string | null };

export function ConversionActionsSection({ actions }: { actions: Action[] }) {
  const visible = actions.filter((a) => a.status !== "REMOVED").sort((a, b) => Number(b.primary) - Number(a.primary) || b.conversions30d - a.conversions30d);
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Medição de conversões</h2>
      <p className="mt-1 mb-3 max-w-[70ch] text-sm leading-relaxed text-ink-2">
        Ações de conversão da conta. Só as principais entram na coluna Conversões e orientam os lances.
      </p>
      {visible.length === 0 ? (
        <p className="panel px-5 py-6 text-sm text-ink-2">A conta não tem nenhuma ação de conversão.</p>
      ) : (
        <ul className="panel divide-y divide-line text-sm">
          {visible.map((a) => (
            <li key={a.actionId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3">
              <span>
                <span className="font-medium">{a.name}</span>
                <span className="ml-2 text-[13px] text-ink-2">
                  {a.primary ? "Principal" : "Secundária"} · {STATUS[a.status] ?? a.status}
                </span>
              </span>
              <span className="num text-[13px] text-ink-2">
                {conv(a.conversions30d)} nos últimos 30 dias
                {a.lastConversionDate ? `, a última em ${fullDate(a.lastConversionDate)}` : ", nenhuma registrada"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
