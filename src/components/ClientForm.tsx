"use client";

import { useActionState } from "react";
import { saveClientAction, type FormState } from "@/app/actions";

export function ClientForm({
  client,
}: {
  client?: { id: string; name: string; monthlyBudget: number | null; targetCpl: number | null };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveClientAction, {});
  const money = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
  return (
    <form action={action} className="max-w-lg space-y-5">
      {client && <input type="hidden" name="id" value={client.id} />}
      <div>
        <label htmlFor="name" className="label">Nome do cliente</label>
        <input id="name" name="name" required minLength={2} maxLength={120} defaultValue={state.values?.name ?? client?.name} className="field" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="monthlyBudget" className="label">Verba mensal (R$)</label>
          <input id="monthlyBudget" name="monthlyBudget" inputMode="decimal" placeholder="900,00" defaultValue={state.values?.monthlyBudget ?? money(client?.monthlyBudget)} className="field num" />
          <p className="hint">Quanto o cliente combinou de investir por mês em anúncios. Sem isso não há alerta de verba.</p>
        </div>
        <div>
          <label htmlFor="targetCpl" className="label">Meta de custo por lead (R$)</label>
          <input id="targetCpl" name="targetCpl" inputMode="decimal" placeholder="45,00" defaultValue={state.values?.targetCpl ?? money(client?.targetCpl)} className="field num" />
          <p className="hint">O máximo que cada conversão deveria custar. Opcional.</p>
        </div>
      </div>
      {state.error && <p role="alert" className="rounded-md border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical-ink">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-md border border-good/40 bg-good/5 px-3 py-2 text-sm text-good-ink">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Salvando…" : client ? "Salvar alterações" : "Cadastrar cliente"}
      </button>
    </form>
  );
}
