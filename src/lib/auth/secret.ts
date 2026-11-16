import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let cached: Uint8Array | undefined;

/**
 * Segredo que assina o cookie de sessão.
 * Em produção vem de SESSION_SECRET. No computador, é criado sozinho em .data/.
 */
export function sessionSecret(): Uint8Array {
  if (cached) return cached;
  let value = process.env.SESSION_SECRET;
  if (!value) {
    if (process.env.VERCEL || process.env.DATABASE_URL) {
      throw new Error("SESSION_SECRET não configurado (use um texto aleatório de 32+ caracteres).");
    }
    const file = path.join(process.cwd(), ".data", "session-secret");
    if (fs.existsSync(file)) value = fs.readFileSync(file, "utf8").trim();
    else {
      value = randomBytes(48).toString("base64url");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, value, { mode: 0o600 });
    }
  }
  if (value.length < 32) throw new Error("SESSION_SECRET precisa de pelo menos 32 caracteres.");
  cached = new TextEncoder().encode(value);
  return cached;
}
