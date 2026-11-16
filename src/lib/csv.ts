import Papa from "papaparse";
import { isIsoDate } from "./dates";

/**
 * Lê o relatório de campanhas exportado do Google Ads (CSV ou "CSV para Excel"),
 * em português ou inglês. Precisa ter as colunas Dia e Campanha.
 */

export type CsvRow = {
  date: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversionsValue: number;
};

export type CsvResult =
  | { ok: true; from: string; to: string; rows: CsvRow[]; skipped: number }
  | { ok: false; error: string };

type Field = "date" | "campaign" | "campaignId" | "impressions" | "clicks" | "cost" | "conversions" | "conversionsValue";

const ALIASES: Record<Field, string[]> = {
  date: ["dia", "day", "data", "date"],
  campaign: ["campanha", "campaign", "nome da campanha", "campaign name"],
  campaignId: ["id da campanha", "campaign id", "codigo da campanha"],
  impressions: ["impr", "impressoes", "impressions"],
  clicks: ["cliques", "clicks"],
  cost: ["custo", "cost"],
  conversions: ["conversoes", "conversions"],
  conversionsValue: ["valor conv", "valor de conv", "valor da conv", "valor da conversao", "conv value", "conversion value"],
};

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[."]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function fieldOf(header: string): Field | null {
  const h = norm(header);
  for (const [field, names] of Object.entries(ALIASES) as [Field, string[]][]) {
    if (names.includes(h)) return field;
  }
  return null;
}

/** O "CSV para Excel" do Google Ads vem em UTF-16 separado por tabulação. */
export function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

/** "1.234,56", "1,234.56", "R$ 12,00", "--" -> número. */
export function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw.replace(/[^\d.,-]/g, "");
  if (!s || s === "-" || s === "--") return 0;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // os dois aparecem: o último é o separador decimal
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const iso = (y: number, m: number, d: number) => {
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(s) ? s : null;
};

/** `monthFirst` só vale para datas com barra (11/16/2026). */
export function parseDate(raw: string, monthFirst = false): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return monthFirst ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
  // "16 de nov. de 2026"
  m = norm(s).match(/^(\d{1,2}) de ([a-z]{3})[a-z]* de (\d{4})$/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  // "Nov 16, 2026"
  m = norm(s).match(/^([a-z]{3})[a-z]* (\d{1,2}),? (\d{4})$/);
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);
  return null;
}

export function parseAdsCsv(text: string): CsvResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  // O arquivo começa com título e período; o cabeçalho é a primeira linha com Dia e Campanha.
  let headerIndex = -1;
  let delimiter = ",";
  for (let i = 0; i < Math.min(lines.length, 15) && headerIndex < 0; i++) {
    for (const d of ["\t", ";", ","]) {
      const fields = lines[i].split(d).map(fieldOf);
      if (fields.includes("date") && fields.includes("campaign")) {
        headerIndex = i;
        delimiter = d;
        break;
      }
    }
  }
  if (headerIndex < 0) {
    return {
      ok: false,
      error:
        'Não encontrei as colunas "Dia" e "Campanha". Exporte o relatório de campanhas segmentado por dia (Segmentar > Tempo > Dia).',
    };
  }

  const parsed = Papa.parse<string[]>(lines.slice(headerIndex).join("\n"), {
    delimiter,
    skipEmptyLines: true,
  });
  const [header, ...body] = parsed.data;
  const col = {} as Partial<Record<Field, number>>;
  header.forEach((h, i) => {
    const f = fieldOf(h);
    if (f && col[f] === undefined) col[f] = i;
  });

  // Datas com barra: 16/11/2026 (Brasil) ou 11/16/2026 (EUA). Descobre olhando o arquivo todo.
  const slashDates = body.map((r) => r[col.date!]?.trim().match(/^(\d{1,2})[/.](\d{1,2})[/.]\d{4}$/));
  const monthFirst =
    slashDates.some((m) => m && +m[2] > 12) && !slashDates.some((m) => m && +m[1] > 12);

  const rows: CsvRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const date = parseDate(r[col.date!] ?? "", monthFirst);
    const name = (r[col.campaign!] ?? "").trim();
    if (!date || !name) {
      skipped++; // linhas de total e rodapé
      continue;
    }
    const get = (f: Field) => (col[f] === undefined ? undefined : r[col[f]!]);
    const id = get("campaignId")?.trim();
    rows.push({
      date,
      campaignId: id || `nome:${name}`,
      campaignName: name,
      impressions: Math.round(parseNumber(get("impressions"))),
      clicks: Math.round(parseNumber(get("clicks"))),
      cost: parseNumber(get("cost")),
      conversions: parseNumber(get("conversions")),
      conversionsValue: parseNumber(get("conversionsValue")),
    });
  }
  if (rows.length === 0) return { ok: false, error: "O arquivo não tem nenhuma linha de dados com data válida." };

  const dates = rows.map((r) => r.date).sort();
  return { ok: true, from: dates[0], to: dates[dates.length - 1], rows, skipped };
}
