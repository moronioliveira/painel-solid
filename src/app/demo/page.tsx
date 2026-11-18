import type { Metadata } from "next";
import { ReportView } from "@/components/ReportView";
import { todayInTz } from "@/lib/dates";
import { buildDemoReport } from "@/lib/demo";

/** Gerada de novo a cada hora: o mês mostrado acompanha o calendário sem precisar publicar de novo. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Exemplo de relatório de anúncios",
  description: "Exemplo, com dados fictícios, do relatório mensal que os clientes da Solid Solutions recebem.",
  robots: { index: false, follow: false },
};

/** Link de contato opcional no aviso do topo (ex.: WhatsApp ou a landing page). Só aceita https. */
function ctaUrl(): string | null {
  const raw = process.env.DEMO_CTA_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export default function DemoPage() {
  const demo = buildDemoReport(todayInTz("America/Sao_Paulo"));
  const cta = ctaUrl();
  return (
    <ReportView
      clientName={demo.clientName}
      month={demo.month}
      report={demo.report}
      extraLines={demo.extraLines}
      resultLine={demo.resultLine}
      bizItems={demo.bizItems}
      today={todayInTz("America/Sao_Paulo")}
      banner={
        <div className="no-print border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3 text-sm">
            <p>
              <strong>Exemplo com dados fictícios.</strong> É assim que os clientes da Solid Solutions acompanham os anúncios todo mês.
            </p>
            {cta && (
              <a href={cta} target="_top" rel="noopener" className="btn btn-primary">
                Quero acompanhar meus anúncios assim
              </a>
            )}
          </div>
        </div>
      }
    />
  );
}
