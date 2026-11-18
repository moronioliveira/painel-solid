import Image from "next/image";

/** O que aparece no link do relatório quando o acesso está bloqueado. Não mostra nada do cliente. */
export function ReportBlocked() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="bg-black text-white">
        <div className="mx-auto flex max-w-[960px] items-center gap-3 px-6 py-4">
          <Image src="/simbolo-solid.png" alt="" width={36} height={32} priority />
          <span className="text-[15px] font-semibold tracking-tight">Solid Solutions</span>
        </div>
        <div className="brand-rule" />
      </header>
      <main className="mx-auto w-full max-w-[560px] flex-1 px-6 py-20">
        <h1 className="text-2xl font-semibold tracking-tight">Relatório indisponível</h1>
        <p className="mt-3 leading-relaxed text-ink-2">
          O acesso a este relatório está pausado. Fale com a Solid Solutions para liberar de novo.
        </p>
      </main>
    </div>
  );
}
