import { createHash, randomBytes } from "node:crypto";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Chave de envio de um cliente. Só o hash vai para o banco. */
export function generateIngestKey() {
  const key = `ps_${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashKey(key), hint: `${key.slice(0, 7)}…${key.slice(-4)}` };
}

/** Token do link público de relatório. */
export const generateReportToken = () => randomBytes(18).toString("base64url");
