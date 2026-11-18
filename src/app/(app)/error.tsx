"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Erro dentro do painel: explica, deixa tentar de novo e não mostra detalhes técnicos. */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg py-16">
      <p className="eyebrow">Algo deu errado</p>
      <h1 className="mt-2 text-[28px] leading-tight font-semibold">Não foi possível carregar esta tela</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
        Normalmente é uma falha passageira na conexão com o banco de dados. Tente de novo em alguns segundos.
        Se continuar, os dados estão guardados: nada foi perdido.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">Tentar de novo</button>
        <Link href="/" className="btn btn-quiet">Ir para a visão geral</Link>
      </div>
      {error.digest && <p className="mt-6 font-mono text-[13px] text-ink-3">Código do erro: {error.digest}</p>}
    </div>
  );
}
