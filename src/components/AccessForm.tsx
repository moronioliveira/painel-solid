"use client";

import { useActionState } from "react";
import { saveAccessAction, type FormState } from "@/app/actions";

export function AccessForm({ client }: { client: { id: string; paidUntil: string | null; graceDays: number } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccessAction, {});
  return (
    <form action={action} className="max-w-lg space-y-5">
      <input type="hidden" name="id" value={client.id} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="paidUntil" className="label">Pago até</label>
          <input key={client.paidUntil ?? ""} id="paidUntil" name="paidUntil" type="date" defaultValue={client.paidUntil ?? ""} className="field num" />
          <p className="hint">Último dia coberto pelo pagamento. Deixe vazio para não controlar vencimento.</p>
        </div>
        <div>
          <label htmlFor="graceDays" className="label">Tolerância (dias)</label>
          <input key={client.graceDays} id="graceDays" name="graceDays" type="number" min={0} max={60} step={1} defaultValue={state.error ? state.values?.graceDays : client.graceDays} className="field num" />
          <p className="hint">Dias depois do vencimento em que o link ainda abre. Depois disso, bloqueia sozinho.</p>
        </div>
      </div>
      {state.error && <p role="alert" className="rounded-md border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical-ink">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-md border border-good/40 bg-good/5 px-3 py-2 text-sm text-good-ink">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Salvando…" : "Salvar vencimento"}</button>
    </form>
  );
}
