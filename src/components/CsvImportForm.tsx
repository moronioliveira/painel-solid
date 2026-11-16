"use client";

import { useActionState } from "react";
import { importCsvAction, type FormState } from "@/app/actions";

export function CsvImportForm({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(importCsvAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={clientId} />
      <div>
        <label htmlFor="file" className="label">Arquivo exportado do Google Ads</label>
        <input id="file" name="file" type="file" accept=".csv,.tsv,.txt,text/csv" required className="field file:mr-3 file:rounded file:border-0 file:bg-canvas file:px-3 file:py-1 file:text-sm file:font-medium" />
      </div>
      {state.error && <p role="alert" className="rounded-md border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical-ink">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-md border border-good/40 bg-good/5 px-3 py-2 text-sm text-good-ink">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn btn-quiet">{pending ? "Importando…" : "Importar arquivo"}</button>
    </form>
  );
}
