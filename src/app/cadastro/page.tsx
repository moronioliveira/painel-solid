import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { getUser } from "@/lib/auth/session";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  if (await getUser()) redirect("/");
  return (
    <AuthShell title="Criar conta">
      <SignUpForm />
      <p className="mt-6 text-sm text-ink-2">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}
