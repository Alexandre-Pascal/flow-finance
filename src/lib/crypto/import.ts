/**
 * @file import.ts
 * @description Parse un fichier CSV/TSV de positions crypto.
 */

export interface CryptoImportRow {
  name: string;
  xpub: string | null;
  symbol: string;
  quantity: number;
  costBasisEur: number;
}

const HEADER_ALIASES: Record<string, keyof CryptoImportRow | "skip"> = {
  nom: "name",
  name: "name",
  "adresse (xpub)": "xpub",
  adresse: "xpub",
  xpub: "xpub",
  crypto: "symbol",
  symbol: "symbol",
  montant: "quantity",
  quantity: "quantity",
  "montant en euro": "costBasisEur",
  "montant en euros": "costBasisEur",
  cost_basis_eur: "costBasisEur",
  costbasiseur: "costBasisEur",
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function detectDelimiter(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function parseNumber(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error(`Montant invalide : ${raw}`);
  }
  return value;
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ",") {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }

    cells.push(current.trim());
    return cells;
  }

  return line.split(delimiter).map((cell) => cell.trim());
}

/**
 * Parse le contenu d'un fichier exporté (Nom, Adresse (xpub), Crypto, Montant, Montant en Euro).
 */
export function parseCryptoImportFile(content: string): CryptoImportRow[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Le fichier doit contenir une ligne d'en-tête et au moins une position.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  const columnMap = new Map<number, keyof CryptoImportRow>();

  headers.forEach((header, index) => {
    const key = HEADER_ALIASES[normalizeHeader(header)];
    if (key && key !== "skip") {
      columnMap.set(index, key);
    }
  });

  const required: Array<keyof CryptoImportRow> = [
    "name",
    "symbol",
    "quantity",
    "costBasisEur",
  ];
  const present = new Set(columnMap.values());
  const missing = required.filter((key) => !present.has(key));
  if (missing.length > 0) {
    throw new Error(
      `Colonnes manquantes : ${missing.join(", ")}. Attendu : Nom, Adresse (xpub), Crypto, Montant, Montant en Euro.`,
    );
  }

  const grouped = new Map<string, CryptoImportRow>();

  for (const line of lines.slice(1)) {
    const cells = splitLine(line, delimiter);
    const row: Partial<CryptoImportRow> = {};

    for (const [index, key] of columnMap.entries()) {
      const raw = cells[index] ?? "";
      if (key === "quantity" || key === "costBasisEur") {
        row[key] = parseNumber(raw);
      } else if (key === "xpub") {
        row.xpub = raw || null;
      } else if (key === "name") {
        row.name = raw;
      } else if (key === "symbol") {
        row.symbol = raw.toUpperCase();
      }
    }

    if (!row.name || !row.symbol || row.quantity == null || row.costBasisEur == null) {
      continue;
    }

    const key = `${row.name}::${row.xpub ?? ""}::${row.symbol}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += row.quantity;
      existing.costBasisEur += row.costBasisEur;
    } else {
      grouped.set(key, {
        name: row.name,
        xpub: row.xpub ?? null,
        symbol: row.symbol,
        quantity: row.quantity,
        costBasisEur: row.costBasisEur,
      });
    }
  }

  if (grouped.size === 0) {
    throw new Error("Aucune position valide trouvée dans le fichier.");
  }

  return [...grouped.values()];
}
