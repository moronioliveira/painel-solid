"use client";

import { useActionState } from "react";
import { signUpAction, type FormState } from "@/app/actions";

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="name" className="label">Seu nome</label>
        <input id="name" name="name" autoComplete="name" required maxLength={120} defaultValue={v.name} className="field" />
      </div>
      <div>
        <label htmlFor="workspaceName" className="label">Nome da agência ou empresa</label>
        <input id="workspaceName" name="workspaceName" autoComplete="organization" required maxLength={120} defaultValue={v.workspaceName} className="field" />
      </div>
      <div>
        <label htmlFor="email" className="label">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required defaultValue={v.email} className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Senha</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} aria-describedby="password-hint" className="field" />
        <p id="password-hint" className="mt-1 text-xs text-ink-2">Pelo menos 10 caracteres.</p>
      </div>
      <div>
        <label htmlFor="passwordConfirm" className="label">Repita a senha</label>
        <input id="passwordConfirm" name="passwordConfirm" type="password" autoComplete="new-password" required minLength={10} className="field" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md border border-critical/40 bg-critical/5 px-3 py-2 text-sm text-critical-ink">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Criando conta…" : "Criar conta"}
      </button>
    </form>
  );
}
