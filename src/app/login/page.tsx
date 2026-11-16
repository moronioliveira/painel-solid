import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { getUser } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  return (
    <AuthShell title="Entrar no painel">
      <LoginForm />
      <p className="mt-6 text-sm text-ink-2">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-ink underline underline-offset-4">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}
