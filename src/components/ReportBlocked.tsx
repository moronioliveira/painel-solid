import Image from "next/image";

const MESSAGES = {
  blocked: {
    title: "Relatório indisponível",
    text: "O acesso a este relatório está pausado. Fale com a Solid Solutions para liberar de novo.",
  },
  empty: {
    title: "O relatório ainda não tem números",
    text: "Os anúncios ainda não começaram a rodar. Os resultados aparecem aqui assim que houver o primeiro dia com anúncios no ar.",
  },
} as const;

/** Tela simples do link do relatório quando não há o que mostrar. Não mostra nada do cliente. */
export function ReportBlocked({ reason = "blocked" }: { reason?: keyof typeof MESSAGES }) {
  const m = MESSAGES[reason];
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
        <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
        <p className="mt-3 leading-relaxed text-ink-2">
          {m.text}
        </p>
      </main>
    </div>
  );
}
