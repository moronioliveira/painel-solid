"use client";

import { useActionState, useState } from "react";
import { saveResultAction, type FormState } from "@/app/actions";

type Saved = Record<string, { leads: number | null; deals: number | null; revenue: number | null }>;

const n = (v: number | null | undefined) => (v == null ? "" : String(v));
const money = (v: number | null | undefined) => (v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));

export function ResultForm({ clientId, saved, defaultMonth, maxMonth }: { clientId: string; saved: Saved; defaultMonth: string; maxMonth: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveResultAction, {});
  const [month, setMonth] = useState(state.values?.month ?? defaultMonth);
  const current = saved[month];
  // Depois de um erro, mostra o que foi digitado; senão, o que está salvo para o mês escolhido.
  const typed = state.error && state.values?.month === month ? state.values : null;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={clientId} />
      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="month" className="label">Mês</label>
          <input id="month" name="month" type="month" required max={maxMonth} value={month} onChange={(e) => setMonth(e.target.value)} className="field num" />
        </div>
        <div key={`l-${month}-${n(current?.leads)}`}>
          <label htmlFor="leads" className="label">Conversas que chegaram</label>
          <input id="leads" name="leads" inputMode="numeric" placeholder="24" defaultValue={typed?.leads ?? n(current?.leads)} className="field num" />
        </div>
        <div key={`d-${month}-${n(current?.deals)}`}>
          <label htmlFor="deals" className="label">Contratos fechados</label>
          <input id="deals" name="deals" inputMode="numeric" placeholder="3" defaultValue={typed?.deals ?? n(current?.deals)} className="field num" />
        </div>
        <div key={`r-${month}-${n(current?.revenue)}`}>
          <label htmlFor="revenue" className="label">Receita (R$)</label>
          <input id="revenue" name="revenue" inputMode="decimal" placeholder="4.500,00" defaultValue={typed?.revenue ?? money(current?.revenue)} className="field num" />
        </div>
      </div>
      <p className="hint max-w-[70ch]">
        Pergunte ao cliente no fim do mês: quantas mensagens com “(ref. C1)” chegaram, quantas viraram contrato e quanto isso somou.
        Qualquer campo pode ficar vazio. Apagar os três remove o mês.
      </p>
      {state.error && <p role="alert" className="rounded-md border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical-ink">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-md border border-good/40 bg-good/5 px-3 py-2 text-sm text-good-ink">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Salvando…" : current ? "Atualizar resultado" : "Salvar resultado"}</button>
    </form>
  );
}
