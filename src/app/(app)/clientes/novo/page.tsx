import type { Metadata } from "next";
import Link from "next/link";
import { ClientForm } from "@/components/ClientForm";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  await requireUser();
  return (
    <>
      <nav className="text-sm text-ink-2" aria-label="Você está em">
        <Link href="/" className="underline underline-offset-2">Visão geral</Link> / Novo cliente
      </nav>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Novo cliente</h1>
      <p className="mt-1 mb-8 max-w-xl text-sm text-ink-2">
        Depois de cadastrar, você recebe a chave e o script para colar na conta do Google Ads deste cliente.
      </p>
      <ClientForm />
    </>
  );
}
