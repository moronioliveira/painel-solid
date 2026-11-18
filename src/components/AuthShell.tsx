import Image from "next/image";
import type { ReactNode } from "react";
import { getTheme, themeClass } from "@/lib/theme";

/** Moldura das telas de entrar e de criar conta. O lado da marca é sempre preto; o formulário segue o tema. */
export async function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const theme = await getTheme();
  return (
    <main className={`${themeClass(theme)} grid min-h-screen grid-rows-[auto_1fr] bg-canvas text-ink md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-1`}>
      <section className="flex flex-col justify-between bg-black px-6 py-5 text-white md:px-14 md:py-14">
        <Image src="/logo-solid.png" alt="Solid Solutions" width={120} height={128} priority className="hidden md:block" />
        <div className="flex items-center gap-3 md:hidden">
          <Image src="/simbolo-solid.png" alt="" width={30} height={27} priority />
          <span className="text-[16px] font-semibold tracking-tight">Painel Solid</span>
        </div>
        <div className="hidden md:block">
          <h1 className="max-w-md text-4xl leading-tight font-semibold tracking-tight">Todos os clientes de Google Ads em uma tela.</h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
            Gasto, conversões e alertas atualizados todo dia, e o relatório mensal pronto para enviar.
          </p>
        </div>
        <div className="brand-rule hidden w-24 rounded-full md:block" />
      </section>
      <section className="flex items-start px-6 py-10 md:items-center md:px-16 md:py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold">{title}</h2>
          {children}
        </div>
      </section>
    </main>
  );
}
