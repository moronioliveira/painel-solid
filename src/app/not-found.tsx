import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        O endereço pode estar errado ou o link pode ter sido trocado. Se você recebeu um link de relatório, peça um novo a quem enviou.
      </p>
      <Link href="/" className="btn btn-quiet mt-6">Ir para o painel</Link>
    </main>
  );
}
