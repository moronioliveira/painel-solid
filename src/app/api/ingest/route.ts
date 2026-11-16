import { getDb } from "@/db";
import { syncAlerts } from "@/lib/alerts/sync";
import { findClientByKey, ingestForClient, ingestPayloadSchema } from "@/lib/ingest";

const MAX_BYTES = 8 * 1024 * 1024;

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status });

/** Recebe o envio diário do script do Google Ads. Autenticação: `Authorization: Bearer <chave do cliente>`. */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!key) return json(401, { ok: false, error: "Chave ausente." });

  const db = await getDb();
  const client = await findClientByKey(db, key);
  if (!client) return json(401, { ok: false, error: "Chave inválida ou cliente desativado." });

  const text = await req.text();
  if (text.length > MAX_BYTES) return json(413, { ok: false, error: "Envio grande demais." });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { ok: false, error: "O corpo não é um JSON válido." });
  }
  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "envio"}: ${i.message}`);
    return json(400, { ok: false, error: "Dados inválidos.", issues });
  }

  const result = await ingestForClient(db, client, parsed.data, "script");
  try {
    await syncAlerts(db, client.workspaceId, { clientId: client.id });
  } catch (err) {
    // Os dados já foram gravados; os alertas são reavaliados quando o painel é aberto.
    console.error("Falha ao reavaliar alertas após envio", err);
  }
  return json(200, { ok: true, ...result });
}
