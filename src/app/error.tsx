"use client";

import { useEffect } from "react";

/** Erro fora do painel (relatório do cliente, login): mensagem simples em português. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-[28px] leading-tight font-semibold">Não foi possível abrir esta página</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
        Foi uma falha passageira do nosso lado. Tente de novo em alguns segundos.
      </p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">Tentar de novo</button>
      {error.digest && <p className="mt-6 font-mono text-[13px] text-ink-3">Código do erro: {error.digest}</p>}
    </main>
  );
}
