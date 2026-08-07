/**
 * @file import.ts
 * @description Parse l'export CSV officiel de Trade Republic (compte-titres +
 * compte espèces) et reconstruit les mouvements et les positions du PEA.
 */

import { normalizeIsin } from "@/lib/market/tickers";
import type { PeaTransactionKind } from "@/types/database";

export interface PeaImportRow {
  transactionDate: string;
  kind: PeaTransactionKind;
  isin: string | null;
  name: string | null;
  quantity: number;
  amountEur: number;
  externalRef: string;
}

export interface PeaImportPosition {
  isin: string;
  name: string;
  quantity: number;
  costBasisEur: number;
}

export interface PeaImportResult {
  rows: PeaImportRow[];
  positions: PeaImportPosition[];
  /** Fenêtre couverte par le fichier : pilote la purge des estimations. */
  periodStart: string;
  periodEnd: string;
}

type ImportField =
  | "transactionDate"
  | "kind"
  | "isin"
  | "name"
  | "description"
  | "quantity"
  | "amountEur"
  | "externalRef"
  | "accountType"
  | "symbol";

const HEADER_ALIASES: Record<string, ImportField> = {
  // Date
  date: "transactionDate",
  datetime: "transactionDate",
  "date de transaction": "transactionDate",
  "date d'exécution": "transactionDate",
  "date d'operation": "transactionDate",
  "date d'opération": "transactionDate",
  datum: "transactionDate",
  "booking date": "transactionDate",
  "value date": "transactionDate",
  timestamp: "transactionDate",

  // Nature du mouvement
  type: "kind",
  typ: "kind",
  "type de transaction": "kind",
  "transaction type": "kind",
  operation: "kind",
  opération: "kind",
  "event type": "kind",

  // Compte (DEFAULT = cash TR, PEA = plan)
  account_type: "accountType",
  "account type": "accountType",
  "type de compte": "accountType",

  // Instrument — chez Trade Republic l'ISIN est dans `symbol`
  isin: "isin",
  "code isin": "isin",
  symbol: "symbol",
  instrument: "name",
  nom: "name",
  name: "name",
  "nom de l'instrument": "name",
  "instrument name": "name",
  titre: "name",
  bezeichnung: "name",
  description: "description",

  // Quantité
  quantité: "quantity",
  quantite: "quantity",
  quantity: "quantity",
  shares: "quantity",
  anzahl: "quantity",
  "nombre de parts": "quantity",
  parts: "quantity",

  // Montant
  montant: "amountEur",
  "montant total": "amountEur",
  "montant en euro": "amountEur",
  "montant en euros": "amountEur",
  amount: "amountEur",
  total: "amountEur",
  betrag: "amountEur",
  "total amount": "amountEur",
  value: "amountEur",

  // Référence
  id: "externalRef",
  "id de transaction": "externalRef",
  "transaction id": "externalRef",
  transaction_id: "externalRef",
  reference: "externalRef",
  référence: "externalRef",
  "order id": "externalRef",
};

const KIND_PATTERNS: Array<{ kind: PeaTransactionKind; needles: string[] }> = [
  {
    kind: "dividend",
    needles: ["dividend", "dividende", "coupon", "distribution"],
  },
  {
    kind: "fee",
    needles: ["fee", "frais", "gebühr", "gebuehr", "commission", "taxe"],
  },
  {
    kind: "interest",
    needles: ["interest", "intérêt", "interet", "zinsen", "rémunération"],
  },
  {
    kind: "buy",
    needles: [
      "buy",
      "achat",
      "kauf",
      "savings plan",
      "plan d'investissement",
      "investissement programmé",
      "sparplan",
      "souscription",
    ],
  },
  {
    kind: "sell",
    needles: ["sell", "vente", "verkauf", "cession", "rachat"],
  },
  {
    kind: "withdrawal",
    needles: [
      "withdrawal",
      "retrait",
      "auszahlung",
      "virement sortant",
      "transfer_out",
      "transfer_outbound",
      "transfer outbound",
      "debit",
    ],
  },
  {
    kind: "deposit",
    needles: [
      "deposit",
      "versement",
      "einzahlung",
      "virement entrant",
      "alimentation",
      "transfer_in",
      "transfer_inbound",
      "transfer inbound",
      "credit",
    ],
  },
];

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function detectDelimiter(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

/** Découpe une ligne CSV en respectant les guillemets, quel que soit le séparateur. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

/** Accepte les formats 1 234,56 / 1,234.56 / -12.34 et les montants entre parenthèses. */
function parseAmount(raw: string): number {
  let value = raw.trim();
  if (!value) {
    return 0;
  }

  let negative = value.startsWith("-");
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }

  value = value.replace(/[^\d.,-]/g, "");

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma > lastDot) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    value = value.replace(/,/g, "");
  }

  const parsed = Number(value.replace(/-/g, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return negative ? -parsed : parsed;
}

/** Normalise une date en ISO (YYYY-MM-DD), en acceptant les formats FR et ISO. */
function parseDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const fr = value.match(/^(\d{2})[/.](\d{2})[/.](\d{4})/);
  if (fr) {
    return `${fr[3]}-${fr[2]}-${fr[1]}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function looksLikeIsin(value: string): boolean {
  return ISIN_PATTERN.test(normalizeIsin(value));
}

/** Extrait un ISIN noyé dans une description Trade Republic. */
function extractIsinFromText(value: string): string | null {
  const match = value.toUpperCase().match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
  return match ? match[1] : null;
}

function resolveKind(
  raw: string,
  quantity: number,
  amount: number,
): PeaTransactionKind | null {
  const value = raw.trim().toLowerCase().replace(/\s+/g, "_");

  for (const { kind, needles } of KIND_PATTERNS) {
    if (
      needles.some((needle) => {
        const normalized = needle.toLowerCase().replace(/\s+/g, "_");
        return value.includes(normalized);
      })
    ) {
      return kind;
    }
  }

  // Colonne de type absente ou libellé inconnu : on déduit du contenu de la ligne.
  if (quantity !== 0) {
    return amount < 0 ? "buy" : "sell";
  }
  if (amount !== 0) {
    return amount < 0 ? "withdrawal" : "deposit";
  }

  return null;
}

/** Empreinte stable d'une ligne, utilisée quand l'export ne fournit pas d'identifiant. */
function hashRow(parts: string): string {
  let hash = 5381;
  for (let index = 0; index < parts.length; index += 1) {
    hash = ((hash << 5) + hash + parts.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Parse un export CSV/TSV Trade Republic et reconstruit mouvements et positions.
 *
 * Format officiel (avril 2026+) : colonnes `date`, `account_type`, `type`,
 * `name`, `symbol` (ISIN), `shares`, `amount`, `transaction_id`. Quand
 * `account_type` est présent, seules les lignes `PEA` sont retenues pour ne
 * pas mélanger le compte cash Trade Republic.
 */
export function parsePeaImportFile(content: string): PeaImportResult {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Le fichier doit contenir une ligne d'en-tête et au moins un mouvement.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  const columnMap = new Map<number, ImportField>();

  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field) {
      columnMap.set(index, field);
    }
  });

  const present = new Set(columnMap.values());
  if (!present.has("transactionDate") || !present.has("amountEur")) {
    throw new Error(
      "Colonnes manquantes : une colonne de date et une colonne de montant sont requises.",
    );
  }

  const hasAccountType = present.has("accountType");
  const rows: PeaImportRow[] = [];
  const seenRefs = new Set<string>();

  lines.slice(1).forEach((line, lineIndex) => {
    const cells = splitLine(line, delimiter);

    let transactionDate: string | null = null;
    let rawKind = "";
    let isin: string | null = null;
    let symbol: string | null = null;
    let name: string | null = null;
    let description: string | null = null;
    let accountType = "";
    let quantity = 0;
    let amountEur = 0;
    let externalRef = "";

    for (const [index, field] of columnMap.entries()) {
      const raw = cells[index] ?? "";

      switch (field) {
        case "transactionDate":
          // `date` prime sur `datetime` : on ne remplace que si encore vide.
          transactionDate = transactionDate ?? parseDate(raw);
          break;
        case "kind":
          rawKind = raw || rawKind;
          break;
        case "isin":
          if (raw && looksLikeIsin(raw)) {
            isin = normalizeIsin(raw);
          }
          break;
        case "symbol":
          symbol = raw || null;
          break;
        case "name":
          name = raw || null;
          break;
        case "description":
          description = raw || null;
          break;
        case "accountType":
          accountType = raw.trim().toUpperCase();
          break;
        case "quantity":
          quantity = parseAmount(raw);
          break;
        case "amountEur":
          amountEur = parseAmount(raw);
          break;
        case "externalRef":
          externalRef = raw;
          break;
      }
    }

    // Export officiel TR : ne garder que le compartiment PEA.
    if (hasAccountType && accountType && accountType !== "PEA") {
      return;
    }

    if (!transactionDate) {
      return;
    }

    if (!isin && symbol && looksLikeIsin(symbol)) {
      isin = normalizeIsin(symbol);
    }
    if (!isin && description) {
      isin = extractIsinFromText(description);
    }

    const kind = resolveKind(rawKind, quantity, amountEur);
    if (!kind) {
      return;
    }

    const displayName = name || description || null;

    const ref = externalRef
      ? `tr:${externalRef}`
      : `tr:${hashRow(`${transactionDate}|${kind}|${isin ?? ""}|${quantity}|${amountEur}|${lineIndex}`)}`;

    if (seenRefs.has(ref)) {
      return;
    }
    seenRefs.add(ref);

    rows.push({
      transactionDate,
      kind,
      isin: isin || null,
      name: displayName,
      quantity: Math.abs(round(quantity, 8)),
      amountEur: Math.abs(round(amountEur, 2)),
      externalRef: ref,
    });
  });

  if (rows.length === 0) {
    throw new Error("Aucun mouvement valide trouvé dans le fichier.");
  }

  const positions = buildPositions(rows);
  const dates = rows.map((row) => row.transactionDate).sort();

  return {
    rows,
    positions,
    periodStart: dates[0],
    periodEnd: dates[dates.length - 1],
  };
}

/**
 * Reconstruit les positions par ISIN à partir des ordres du fichier.
 * Une vente retire le coût d'acquisition au prorata des parts cédées.
 */
export function buildPositions(rows: PeaImportRow[]): PeaImportPosition[] {
  const byIsin = new Map<string, PeaImportPosition>();

  const ordered = [...rows].sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate),
  );

  for (const row of ordered) {
    if (!row.isin || (row.kind !== "buy" && row.kind !== "sell")) {
      continue;
    }

    const existing = byIsin.get(row.isin) ?? {
      isin: row.isin,
      name: row.name ?? row.isin,
      quantity: 0,
      costBasisEur: 0,
    };

    if (row.name && existing.name === existing.isin) {
      existing.name = row.name;
    }

    if (row.kind === "buy") {
      existing.quantity = round(existing.quantity + row.quantity, 8);
      existing.costBasisEur = round(existing.costBasisEur + row.amountEur, 2);
    } else {
      const sellRatio =
        existing.quantity > 0 ? Math.min(1, row.quantity / existing.quantity) : 0;
      existing.quantity = round(Math.max(0, existing.quantity - row.quantity), 8);
      existing.costBasisEur = round(
        Math.max(0, existing.costBasisEur - existing.costBasisEur * sellRatio),
        2,
      );
    }

    byIsin.set(row.isin, existing);
  }

  return [...byIsin.values()];
}
