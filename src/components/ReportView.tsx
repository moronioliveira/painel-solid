import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PrintButton } from "@/components/PrintButton";
import type { Reach } from "@/lib/ads-extras";
import { brl, conv, dayMonth, fullDate, int, monthLabel, monthName } from "@/lib/format";
import type { MonthlyReport } from "@/lib/report";
import { cleanCampaignName, comparison, moneyShort, weeklyTotals } from "@/lib/report-view";
import { businessMetrics, type ResultInput } from "@/lib/results";

type MonthLink = { month: string; href: string };

/**
 * O relatório mensal como o cliente vê: uma "carta do mês" que responde primeiro
 * se os anúncios trouxeram clientes e quanto custou, e depois mostra o porquê.
 * Usado pelo link do cliente e pela demonstração pública.
 *
 * Cores dos gráficos validadas com a skill de visualização (slots 1 a 3 e rampa ordinal azul).
 */
const C = {
  // Mesma lógica do painel: azul = resultado, laranja = dinheiro e verba.
  series: "#2a78d6",
  track: "#cde2fb",
  money: "#eb6834",
  moneyTrack: "#f9d6c6",
  missedBudget: "#eb6834",
  missedOther: "#1baf7a",
  funnel: ["#86b6ef", "#3987e5", "#1c5cab"],
} as const;

const contatos = (n: number) => `${conv(n)} ${n === 1 ? "contato" : "contatos"}`;

export function ReportView({
  clientName,
  month,
  report,
  budget,
  result,
  reach,
  topTerms,
  today,
  older,
  newer,
  banner,
}: {
  clientName: string;
  month: string;
  report: MonthlyReport;
  budget: number | null;
  result: ResultInput | null;
  reach: Reach | null;
  topTerms: string[];
  today: string;
  older?: MonthLink;
  newer?: MonthLink;
  banner?: ReactNode;
}) {
  const t = report.totals;
  const costPer = t.conversions > 0 ? t.cost / t.conversions : null;
  const prevName = report.partial ? `os mesmos dias de ${monthName(report.prevMonth)}` : monthName(report.prevMonth);
  const cmp = comparison(t, report.prevTotals, prevName);
  const weeks = weeklyTotals(report.daily, report.from, report.to);
  const bestWeek = [...weeks].sort((a, b) => b.conversions - a.conversions)[0];
  const maxWeek = Math.max(1, ...weeks.map((w) => w.conversions));
  // Quem trouxe mais contatos primeiro: é o que importa para o cliente.
  const campaigns = report.campaigns.filter((c) => c.cost > 0 || c.conversions > 0).sort((a, b) => b.conversions - a.conversions || b.cost - a.cost);
  const maxCampaign = Math.max(1, ...campaigns.map((c) => c.conversions));
  const hasResult = !!result && (result.leads != null || result.deals != null || result.revenue != null);
  const biz = hasResult ? businessMetrics(t, result!) : null;
  const funnel = hasResult
    ? [
        { label: "Contatos pelos anúncios", value: t.conversions },
        ...(result!.leads != null ? [{ label: "Conversas que chegaram", value: result!.leads }] : []),
        ...(result!.deals != null ? [{ label: "Contratos fechados", value: result!.deals }] : []),
      ]
    : [];
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.value));
  const budgetShare = budget && budget > 0 && t.cost > 0 ? t.cost / budget : null;
  const period = report.partial ? `de ${dayMonth(report.from)} a ${dayMonth(report.to)}` : `em ${monthName(month)}`;

  return (
    <div className="min-h-screen bg-white text-ink">
      {banner}
      <header className="print-exact bg-black text-white">
        <div className="mx-auto flex max-w-[720px] items-center gap-3 px-5 py-3.5 sm:px-8">
          <Image src="/simbolo-solid.png" alt="" width={30} height={27} priority />
          <span className="text-[15px] font-semibold tracking-tight">Solid Solutions</span>
        </div>
        <div className="brand-rule print-exact" />
      </header>

      <main className="mx-auto max-w-[720px] px-5 pb-16 sm:px-8 print:max-w-none print:pb-0">
        <nav className="no-print flex flex-wrap items-center justify-between gap-3 pt-5 text-sm" aria-label="Meses">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {older && <Link href={older.href} className="underline underline-offset-4">Mês anterior ({monthName(older.month)})</Link>}
            {newer && <Link href={newer.href} className="underline underline-offset-4">Mês seguinte ({monthName(newer.month)})</Link>}
          </div>
          <PrintButton />
        </nav>

        {/* Para quem é e de quando */}
        <div className="pt-8 sm:pt-10 print:pt-4">
          <p className="text-[15px] text-ink-2 first-letter:uppercase">Relatório de anúncios no Google, {monthLabel(month)}</p>
          <h1 className="mt-1 text-[27px] font-semibold leading-tight tracking-tight sm:text-[34px]">{clientName}</h1>
          {report.partial && (
            <p className="mt-2 text-[15px] text-ink-2">Mês em andamento: números de {fullDate(report.from)} a {fullDate(report.to)}.</p>
          )}
        </div>

        {/* A resposta: os anúncios trouxeram clientes? quanto custou? */}
        <section className="avoid-break mt-10 border-t-2 border-ink pt-8 print:mt-6 print:pt-5" aria-labelledby="resposta">
          <h2 id="resposta" className="sr-only">Resultado do mês</h2>
          <p className="flex flex-wrap items-baseline gap-x-4">
            <span className="font-display text-[72px] font-semibold leading-[0.9] tracking-[-0.04em] sm:text-[104px] print:text-[64px]">{conv(t.conversions)}</span>
            <span className="text-[21px] font-medium leading-snug sm:text-[27px]">
              {t.conversions === 1 ? "contato" : "contatos"} pelos seus anúncios no Google {period}
            </span>
          </p>
          <dl className="mt-6 grid gap-x-10 gap-y-3 text-[17px] sm:grid-cols-2">
            <div>
              <dt className="text-[15px] text-ink-2">Cada contato custou</dt>
              <dd className="font-display text-[22px] font-semibold">{costPer === null ? "—" : moneyShort(costPer)}</dd>
            </div>
            <div>
              <dt className="text-[15px] text-ink-2">Investido no Google</dt>
              <dd className="font-display text-[22px] font-semibold">{moneyShort(t.cost)}</dd>
            </div>
          </dl>
          {t.conversions === 0 && (
            <p className="mt-5 max-w-[60ch] text-[17px] leading-relaxed">
              Ainda nenhum contato veio pelos anúncios nesse período. Estamos acompanhando as buscas e os ajustes da campanha.
            </p>
          )}
          {cmp && (
            <p className={`mt-5 flex max-w-[60ch] gap-2 text-[17px] leading-relaxed ${cmp.better ? "text-good-ink" : "text-ink"}`}>
              <span aria-hidden className="select-none">{cmp.better ? "▲" : "▼"}</span>
              <span>{cmp.text}</span>
            </p>
          )}
        </section>

        {/* No negócio: do clique ao contrato */}
        {hasResult && biz && (
          <section className="mt-14 print:mt-7" aria-labelledby="negocio">
            <h2 id="negocio" className="text-[21px] font-semibold tracking-tight">No seu negócio</h2>
            <p className="mt-1 max-w-[60ch] text-[17px] leading-relaxed text-ink-2">Do clique no anúncio até o contrato, com os números informados pelo seu atendimento.</p>
            <ol className="avoid-break mt-5 space-y-3">
              {funnel.map((f, i) => (
                <li key={f.label} className="grid grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[200px_minmax(0,1fr)] sm:items-center sm:gap-4">
                  <span className="text-[15px] text-ink-2">{f.label}</span>
                  <span className="flex items-center gap-3">
                    <span
                      className="print-exact block h-5 rounded-r"
                      style={{ width: `${Math.max(2, (f.value / maxFunnel) * 100)}%`, maxWidth: "calc(100% - 4rem)", background: C.funnel[Math.min(i, 2)] }}
                      aria-hidden
                    />
                    <span className="text-[17px] font-semibold">{int(f.value)}</span>
                  </span>
                </li>
              ))}
            </ol>
            {(result!.revenue != null || biz.returnPerReal !== null) && (
              <div className="mt-7 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                {result!.revenue != null && (
                  <div>
                    <p className="text-[15px] text-ink-2">Receita dos contratos</p>
                    <p className="font-display text-[27px] font-semibold tracking-tight">{moneyShort(result!.revenue)}</p>
                  </div>
                )}
                {biz.returnPerReal !== null && (
                  <div>
                    <p className="text-[15px] text-ink-2">Cada R$ 1 em anúncios voltou como</p>
                    <p className="font-display text-[27px] font-semibold tracking-tight">{brl(biz.returnPerReal)}</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Como foi o mês */}
        <section className="mt-14 print:mt-7" aria-labelledby="mes">
          <h2 id="mes" className="text-[21px] font-semibold tracking-tight">Como foi o mês</h2>
          <p className="mt-1 max-w-[60ch] text-[17px] leading-relaxed text-ink-2">
            Os anúncios apareceram {int(t.impressions)} vezes nas buscas e levaram {int(t.clicks)} {t.clicks === 1 ? "pessoa" : "pessoas"} ao seu site.
            {bestWeek && bestWeek.conversions > 0 && weeks.length > 1 && <> A semana com mais contatos foi a dos dias {bestWeek.label}.</>}
          </p>
          <figure className="avoid-break mt-6 print:mt-3">
            <figcaption className="text-[15px] font-medium">Contatos por semana</figcaption>
            <ul className="mt-3 flex h-48 items-end gap-2 border-b border-line-strong sm:gap-4 print:h-32" aria-label="Contatos por semana">
              {weeks.map((w) => (
                <li
                  key={w.from}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                  title={`Dias ${w.label}: ${contatos(w.conversions)}, ${moneyShort(w.cost)} investidos`}
                >
                  <span className="mb-1.5 text-[15px] font-semibold">{conv(w.conversions)}</span>
                  <span
                    className="print-exact block w-6 rounded-t"
                    style={{ height: `${(w.conversions / maxWeek) * 78}%`, minHeight: w.conversions > 0 ? 4 : 0, background: C.series }}
                    aria-hidden
                  />
                  <span className="sr-only">Dias {w.label}: {contatos(w.conversions)}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-2 flex gap-2 sm:gap-4" aria-hidden>
              {weeks.map((w) => (
                <li key={w.from} className="min-w-0 flex-1 text-center text-[13px] text-ink-2">{w.label}</li>
              ))}
            </ul>
          </figure>
          <details className="no-print mt-4 text-[15px]">
            <summary className="cursor-pointer text-ink-2 underline underline-offset-4">Ver os números por dia</summary>
            <div className="mt-3 max-h-80 overflow-auto rounded-md border border-line">
              <table className="w-full border-collapse text-[15px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-line text-left text-ink-2">
                    <th className="px-3 py-2 font-medium">Dia</th>
                    <th className="px-3 py-2 text-right font-medium">Contatos</th>
                    <th className="px-3 py-2 text-right font-medium">Visitas</th>
                    <th className="px-3 py-2 text-right font-medium">Investido</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {report.daily.map((d) => (
                    <tr key={d.date} className="border-b border-line last:border-0">
                      <td className="px-3 py-1.5">{dayMonth(d.date)}</td>
                      <td className="px-3 py-1.5 text-right">{conv(d.conversions)}</td>
                      <td className="px-3 py-1.5 text-right">{int(d.clicks)}</td>
                      <td className="px-3 py-1.5 text-right">{brl(d.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        {/* O que trouxe resultado */}
        {campaigns.length > 0 && (
          <section className="avoid-break mt-14 print:mt-7" aria-labelledby="campanhas">
            <h2 id="campanhas" className="text-[21px] font-semibold tracking-tight">O que trouxe resultado</h2>
            <ul className="avoid-break mt-4 divide-y divide-line border-y border-line">
              {campaigns.map((c) => {
                const each = c.conversions > 0 ? c.cost / c.conversions : null;
                return (
                  <li key={c.campaignId} className="py-4 print:py-2.5">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="min-w-0 text-[17px] font-medium" title={c.campaignName}>{cleanCampaignName(c.campaignName)}</span>
                      <span className="shrink-0 text-[17px] font-semibold">{contatos(c.conversions)}</span>
                    </div>
                    <span className="print-exact mt-2 block h-2 rounded-full" style={{ background: C.track }} aria-hidden>
                      <span className="block h-2 rounded-full" style={{ width: `${(c.conversions / maxCampaign) * 100}%`, background: C.series }} />
                    </span>
                    <p className="mt-2 text-[15px] text-ink-2">
                      {each === null ? "Sem contatos ainda" : `${moneyShort(each)} por contato`}, {moneyShort(c.cost)} investidos
                    </p>
                  </li>
                );
              })}
            </ul>
            {topTerms.length > 0 && (
              <div className="mt-6">
                <p className="text-[15px] text-ink-2">O que as pessoas pesquisaram antes de entrar em contato</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {topTerms.map((term) => (
                    <li key={term} className="rounded-full border border-line-strong px-3 py-1 text-[15px]">{term}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Alcance e verba */}
        {(reach || budgetShare !== null) && (
          <section className="mt-14 print:mt-7" aria-labelledby="alcance">
            <h2 id="alcance" className="text-[21px] font-semibold tracking-tight">Alcance e verba</h2>
            {reach && (
              <div className="mt-4">
                <p className="max-w-[60ch] text-[17px] leading-relaxed">
                  Os anúncios apareceram em <strong>{Math.round(reach.share * 100)}%</strong> das buscas em que poderiam aparecer.
                  {reach.lostBudget >= 0.15 && <> Em {Math.round(reach.lostBudget * 100)}% delas não apareceram porque a verba do dia já tinha acabado.</>}
                </p>
                <ReachBar reach={reach} />
              </div>
            )}
            {budgetShare !== null && budget && (
              <div className="mt-7">
                <p className="max-w-[60ch] text-[17px] leading-relaxed">
                  {report.partial ? "Até agora foram usados" : "Foram usados"} <strong>{moneyShort(t.cost)}</strong> da verba de {moneyShort(budget)} combinada para o mês.
                </p>
                <span
                  className="print-exact mt-3 block h-2 overflow-hidden rounded-full"
                  style={{ background: C.moneyTrack }}
                  role="img"
                  aria-label={`${Math.round(budgetShare * 100)}% da verba usada`}
                >
                  <span className="block h-2 rounded-full" style={{ width: `${Math.min(100, budgetShare * 100)}%`, background: C.money }} />
                </span>
                <p className="mt-1.5 text-[13px] text-ink-2">{Math.round(budgetShare * 100)}% da verba</p>
              </div>
            )}
          </section>
        )}

        {/* Glossário: recolhido na tela, aberto no PDF */}
        <section className="avoid-break mt-14 border-t border-line pt-6 print:mt-7 print:pt-4" aria-labelledby="glossario">
          <details className="no-print group">
            <summary id="glossario" className="cursor-pointer text-[17px] font-semibold">O que cada número quer dizer</summary>
            <Glossary withReturn={biz?.returnPerReal != null} withReach={!!reach} />
          </details>
          <div className="print-only">
            <h2 className="text-[17px] font-semibold">O que cada número quer dizer</h2>
            <Glossary withReturn={biz?.returnPerReal != null} withReach={!!reach} />
          </div>
        </section>

        <footer className="mt-10 text-[13px] text-ink-2 print:mt-5">
          Preparado pela Solid Solutions com dados do Google Ads. Gerado em {fullDate(today)}.
        </footer>
      </main>
    </div>
  );
}

function ReachBar({ reach }: { reach: Reach }) {
  const other = Math.max(0, 1 - reach.share - reach.lostBudget);
  const parts = [
    { label: "Apareceu", value: reach.share, color: C.series },
    { label: "Não apareceu: a verba do dia acabou", value: reach.lostBudget, color: C.missedBudget },
    { label: "Não apareceu: outros motivos", value: other, color: C.missedOther },
  ].filter((p) => p.value > 0.005);
  return (
    <div className="mt-3">
      <div className="print-exact flex h-2 gap-0.5" role="img" aria-label={parts.map((p) => `${p.label}: ${Math.round(p.value * 100)}%`).join("; ")}>
        {parts.map((p) => (
          <span key={p.label} className="block h-2 rounded-full" style={{ width: `${p.value * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-[15px]">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="print-exact inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-ink-2">{p.label}</span>
            <span className="ml-auto font-medium">{Math.round(p.value * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Glossary({ withReturn, withReach }: { withReturn: boolean; withReach: boolean }) {
  const items: [string, string][] = [
    ["Contatos", "Quantas vezes alguém que veio de um anúncio clicou no botão para falar com você, como o do WhatsApp. Nem todo clique vira conversa: a pessoa pode desistir antes de enviar a mensagem."],
    ["Cada contato custou", "O valor investido dividido pelo número de contatos. Quanto menor, melhor."],
    ["Investido no Google", "O que o Google cobrou pelos anúncios. O Google só cobra quando alguém clica. Não inclui o valor da gestão."],
    ["Visitas ao site", "Quantas pessoas clicaram no anúncio e entraram no seu site."],
  ];
  if (withReach) items.push(["Buscas em que poderiam aparecer", "Todas as vezes que alguém pesquisou algo ligado ao seu serviço, na sua região. O anúncio fica de fora quando a verba do dia acaba ou quando outro anunciante ganha o espaço."]);
  if (withReturn) items.push(["Cada R$ 1 voltou como", "A receita dos contratos dividida pelo valor investido em anúncios. Acima de R$ 1, a receita foi maior do que o investido."]);
  return (
    <dl className="mt-4 grid gap-x-10 gap-y-4 text-[15px] leading-relaxed sm:grid-cols-2 print:mt-2 print:gap-y-2 print:text-[12px] print:leading-snug">
      {items.map(([term, def]) => (
        <div key={term}>
          <dt className="font-semibold">{term}</dt>
          <dd className="text-ink-2">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
