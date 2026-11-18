/** Esqueleto enquanto a tela busca os dados: mostra que está carregando, não travado. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="animate-pulse motion-reduce:animate-none">
        <div className="h-3 w-40 rounded bg-surface-2" />
        <div className="mt-3 h-9 w-64 rounded bg-surface-2" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel h-24" />
          ))}
        </div>
        <div className="panel mt-4 h-72" />
      </div>
    </div>
  );
}
