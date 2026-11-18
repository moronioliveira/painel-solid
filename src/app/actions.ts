"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { syncAlerts } from "@/lib/alerts/sync";
import { checkLogin, inviteMatches, signUp } from "@/lib/auth/login";
import { createSession, destroySession, requireUser } from "@/lib/auth/session";
import { addMonthsClamped } from "@/lib/access";
import { dailyToMonthly } from "@/lib/budget";
import { getClient } from "@/lib/clients";
import { isIsoDate, isMonthKey, todayInTz } from "@/lib/dates";
import { saveResult } from "@/lib/results";
import { decodeCsv, parseAdsCsv, parseNumber } from "@/lib/csv";
import { fullDate } from "@/lib/format";
import { ingestForClient, ingestPayloadSchema } from "@/lib/ingest";
import { generateIngestKey, generateReportToken } from "@/lib/keys";

/** `values` devolve o que foi digitado, porque o React limpa o formulário depois de cada envio. */
export type FormState = { error?: string; ok?: string; values?: Record<string, string> };

const text = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
};

/** "1.500,00" -> 1500; vazio -> null; inválido -> undefined. */
function money(raw: string): number | null | undefined {
  if (!raw) return null;
  if (!/\d/.test(raw) || raw.includes("-")) return undefined;
  const n = parseNumber(raw);
  return n > 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : undefined;
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = text(fd, "email");
  const password = typeof fd.get("password") === "string" ? (fd.get("password") as string) : "";
  const values = { email };
  if (!email || !password) return { error: "Preencha e-mail e senha.", values };
  const db = await getDb();
  const result = await checkLogin(db, email, password);
  if (!result.ok) {
    return {
      values,
      error:
        result.reason === "locked"
          ? "Muitas tentativas seguidas. Aguarde 15 minutos e tente de novo."
          : "E-mail ou senha incorretos.",
    };
  }
  await createSession(result.userId);
  redirect("/");
}

const SIGNUP_ERRORS = {
  missing_name: "Informe o seu nome.",
  invalid_email: "E-mail inválido.",
  weak_password: "A senha precisa de 10 a 200 caracteres.",
  email_taken: "Já existe uma conta com este e-mail. Use a tela de entrar.",
  rate_limited: "Muitos cadastros seguidos. Aguarde uma hora e tente de novo.",
} as const;

export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const name = text(fd, "name");
  const workspaceName = text(fd, "workspaceName");
  const email = text(fd, "email");
  const raw = (field: string) => (typeof fd.get(field) === "string" ? (fd.get(field) as string) : "");
  const password = raw("password");
  const values = { name, workspaceName, email, invite: text(fd, "invite") };
  const expected = process.env.SIGNUP_INVITE_CODE;
  if (!expected?.trim()) return { error: "O cadastro está fechado. Peça acesso à Solid Solutions.", values };
  if (!name || !workspaceName || !email || !password) return { error: "Preencha todos os campos.", values };
  if (!inviteMatches(text(fd, "invite"), expected)) return { error: "Código de convite inválido.", values };
  if (password !== raw("passwordConfirm")) return { error: "As duas senhas não são iguais.", values };
  const h = await headers();
  const origin = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconhecido";
  const db = await getDb();
  const result = await signUp(db, { name, workspaceName, email, password }, origin);
  if (!result.ok) return { error: SIGNUP_ERRORS[result.reason], values };
  await createSession(result.userId);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** Guarda a chave recém-criada por 10 minutos, só para a tela de configuração mostrá-la uma vez. */
async function flashKey(clientId: string, key: string) {
  (await cookies()).set(`ps_key_${clientId}`, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: `/clientes/${clientId}`,
    maxAge: 600,
  });
}

export async function saveClientAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = text(fd, "id");
  const name = text(fd, "name");
  const daily = money(text(fd, "dailyBudget"));
  const targetCpl = money(text(fd, "targetCpl"));
  const values = { name, monthlyBudget: text(fd, "monthlyBudget"), dailyBudget: text(fd, "dailyBudget"), targetCpl: text(fd, "targetCpl") };
  if (name.length < 2 || name.length > 120) return { values, error: "Informe o nome do cliente (2 a 120 caracteres)." };
  if (daily === undefined) return { values, error: "Verba diária inválida. Use um valor como 30 ou 32,50." };
  // A verba diária, quando preenchida, manda: o painel guarda o equivalente mensal.
  const monthlyBudget = daily ? dailyToMonthly(daily) : money(text(fd, "monthlyBudget"));
  if (monthlyBudget === undefined) return { values, error: "Verba mensal inválida. Use um valor como 900 ou 1.500,00." };
  if (daily) {
    values.monthlyBudget = dailyToMonthly(daily).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    values.dailyBudget = "";
  }
  if (targetCpl === undefined) return { values, error: "Meta de custo por lead inválida. Use um valor como 45 ou 37,50." };

  const db = await getDb();
  if (id) {
    const client = await getClient(db, user.workspaceId, id);
    if (!client) return { values, error: "Cliente não encontrado." };
    await db.update(clients).set({ name, monthlyBudget, targetCpl }).where(eq(clients.id, client.id));
    await syncAlerts(db, user.workspaceId, { clientId: client.id });
    revalidatePath("/", "layout");
    return { values, ok: daily ? `Alterações salvas. Verba mensal calculada: R$ ${values.monthlyBudget}.` : "Alterações salvas." };
  }

  const k = generateIngestKey();
  const [created] = await db
    .insert(clients)
    .values({
      workspaceId: user.workspaceId,
      name,
      monthlyBudget,
      targetCpl,
      ingestKeyHash: k.hash,
      ingestKeyHint: k.hint,
      reportToken: generateReportToken(),
    })
    .returning();
  await flashKey(created.id, k.key);
  redirect(`/clientes/${created.id}/config`);
}

export async function regenerateKeyAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return;
  const k = generateIngestKey();
  await db.update(clients).set({ ingestKeyHash: k.hash, ingestKeyHint: k.hint }).where(eq(clients.id, client.id));
  await flashKey(client.id, k.key);
  revalidatePath("/", "layout");
  redirect(`/clientes/${client.id}/config#envio`);
}

export async function regenerateReportLinkAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return;
  await db.update(clients).set({ reportToken: generateReportToken() }).where(eq(clients.id, client.id));
  // Sem isto a tela continuaria mostrando o link antigo, que já não abre.
  revalidatePath("/", "layout");
  redirect(`/clientes/${client.id}/config#relatorio`);
}

export async function setActiveAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return;
  const active = text(fd, "active") === "1";
  await db.update(clients).set({ active }).where(eq(clients.id, client.id));
  revalidatePath("/", "layout");
  redirect(active ? `/clientes/${client.id}` : "/");
}

export async function saveAccessAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return { error: "Cliente não encontrado." };
  const paidRaw = text(fd, "paidUntil");
  const graceRaw = text(fd, "graceDays");
  const values = { paidUntil: paidRaw, graceDays: graceRaw };
  if (paidRaw && !isIsoDate(paidRaw)) return { values, error: "Data de vencimento inválida." };
  const graceDays = graceRaw === "" ? 5 : Number(graceRaw);
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 60) return { values, error: "Tolerância precisa ser um número de 0 a 60 dias." };
  await db.update(clients).set({ paidUntil: paidRaw || null, graceDays }).where(eq(clients.id, client.id));
  revalidatePath("/", "layout");
  return { values, ok: "Acesso salvo." };
}

/** Registra mais um mês pago a partir do vencimento atual (ou de hoje, se já venceu ou não havia data). */
export async function renewAccessAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return;
  const today = todayInTz(user.timezone);
  const from = client.paidUntil && client.paidUntil >= today ? client.paidUntil : today;
  await db.update(clients).set({ paidUntil: addMonthsClamped(from, 1) }).where(eq(clients.id, client.id));
  revalidatePath("/", "layout");
  redirect(`/clientes/${client.id}/config#acesso`);
}

export async function setSuspendedAction(fd: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return;
  await db.update(clients).set({ accessSuspended: text(fd, "suspended") === "1" }).where(eq(clients.id, client.id));
  revalidatePath("/", "layout");
  redirect(`/clientes/${client.id}/config#acesso`);
}

export async function importCsvAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return { error: "Cliente não encontrado." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo CSV exportado do Google Ads." };
  if (file.size > 6 * 1024 * 1024) return { error: "Arquivo maior que 6 MB. Exporte um período menor." };

  const parsed = parseAdsCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())));
  if (!parsed.ok) return { error: parsed.error };
  const payload = ingestPayloadSchema.safeParse({ from: parsed.from, to: parsed.to, rows: parsed.rows });
  if (!payload.success) {
    return { error: `Não consegui usar o arquivo: ${payload.error.issues[0]?.message ?? "formato inesperado"}.` };
  }
  const result = await ingestForClient(db, client, payload.data, "csv");
  await syncAlerts(db, user.workspaceId, { clientId: client.id });
  revalidatePath("/", "layout");
  return {
    ok: `Importado: ${result.rows} linhas de ${fullDate(parsed.from)} a ${fullDate(parsed.to)}. Os dados desse período foram substituídos.`,
  };
}

/** "12" -> 12; vazio -> null; inválido -> undefined. */
function count(raw: string): number | null | undefined {
  if (!raw) return null;
  if (!/^\d{1,7}$/.test(raw.replace(/\./g, ""))) return undefined;
  return Number(raw.replace(/\./g, ""));
}

export async function saveResultAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const month = text(fd, "month");
  const values = { month, leads: text(fd, "leads"), deals: text(fd, "deals"), revenue: text(fd, "revenue") };
  if (!isMonthKey(month)) return { values, error: "Escolha o mês." };
  if (month > todayInTz(user.timezone).slice(0, 7)) return { values, error: "Não dá para lançar resultado de um mês que ainda não começou." };
  const leads = count(values.leads);
  const deals = count(values.deals);
  const revenue = values.revenue === "0" || values.revenue === "0,00" ? null : money(values.revenue);
  if (leads === undefined) return { values, error: "Contatos recebidos precisa ser um número inteiro, como 24." };
  if (deals === undefined) return { values, error: "Contratos fechados precisa ser um número inteiro, como 3." };
  if (revenue === undefined) return { values, error: "Receita inválida. Use um valor como 4.500 ou 4.500,00." };
  if (leads != null && deals != null && deals > leads) return { values, error: "Há mais contratos fechados do que contatos recebidos. Confira os números." };
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, text(fd, "id"));
  if (!client) return { values, error: "Cliente não encontrado." };
  await saveResult(db, { workspaceId: user.workspaceId, clientId: client.id, month, leads, deals, revenue });
  revalidatePath("/", "layout");
  const cleared = leads == null && deals == null && revenue == null;
  return { values, ok: cleared ? "Resultado do mês apagado." : "Resultado salvo." };
}
