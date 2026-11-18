import { brl, conv, cpl, int, pct } from "@/lib/format";
import type { CampaignTotals } from "@/lib/metrics";
import { TERMS, type Audience } from "@/lib/terms";

const STATUS: Record<string, string> = { ENABLED: "Ativa", PAUSED: "Pausada", REMOVED: "Removida" };

export function CampaignTable({
  campaigns,
  showStatus = true,
  audience = "team",
}: {
  campaigns: CampaignTotals[];
  showStatus?: boolean;
  audience?: Audience;
}) {
  const T = TERMS[audience];
  if (campaigns.length === 0) {
    return <p className="panel px-5 py-6 text-sm text-ink-2">{audience === "team" ? "Nenhuma campanha teve dados neste período." : "Nenhum anúncio esteve no ar neste período."}</p>;
  }
  return (
    <div className="panel relative overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[720px] border-collapse print:min-w-0">
        <thead>
          <tr className="border-b border-line">
            <th className="th pl-5">Campanha</th>
            {showStatus && <th className="th">Estado</th>}
            <th className="th text-right">{T.impressions}</th>
            <th className="th text-right">{T.clicks}</th>
            <th className="th text-right">Investido</th>
            <th className="th text-right">{T.conversions}</th>
            <th className="th pr-5 text-right">{T.costPer}</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => {
            const each = cpl(c.cost, c.conversions);
            return (
              <tr key={c.campaignId} className="border-b border-line last:border-0">
                <td className="td max-w-[320px] pl-5 font-medium">{c.campaignName}</td>
                {showStatus && <td className="td text-ink-2">{c.status ? (STATUS[c.status] ?? c.status) : "—"}</td>}
                <td className="td num text-right">{int(c.impressions)}</td>
                <td className="td num text-right">
                  {int(c.clicks)}
                  {audience === "team" && c.impressions > 0 && <span className="ml-1.5 text-[13px] text-ink-3">{pct(c.clicks / c.impressions)}</span>}
                </td>
                <td className="td num text-right">{brl(c.cost)}</td>
                <td className="td num text-right">{conv(c.conversions)}</td>
                <td className="td num pr-5 text-right">{each === null ? "—" : brl(each)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
