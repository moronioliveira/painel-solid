import Image from "next/image";
import type { ReactNode } from "react";

/** Moldura das telas de entrar e de criar conta. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="flex flex-col justify-between bg-black px-8 py-10 text-white md:px-14 md:py-14">
        <Image src="/logo-solid.png" alt="Solid Solutions" width={120} height={128} priority />
        <div className="mt-10 md:mt-0">
          <h1 className="max-w-md text-3xl leading-tight font-semibold tracking-tight md:text-4xl">
            Todos os clientes de Google Ads em uma tela.
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
            Gasto, conversões e alertas atualizados todo dia, e o relatório mensal pronto para enviar.
          </p>
        </div>
        <div className="brand-rule mt-10 w-24 rounded-full md:mt-0" />
      </section>
      <section className="flex items-center px-8 py-12 md:px-16">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">{title}</h2>
          {children}
        </div>
      </section>
    </main>
  );
}
