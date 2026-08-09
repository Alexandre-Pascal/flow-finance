/**
 * @file aspsps.ts
 * @description Caisses régionales Crédit Agricole exposées à la connexion.
 *
 * Les noms doivent correspondre exactement à ceux d'Enable Banking.
 * À vérifier dans le Control Panel si l'OAuth échoue.
 */

export interface CaAspspOption {
  id: string;
  name: string;
  country: string;
}

export const CA_ASPSPS: readonly CaAspspOption[] = [
  {
    id: "toulouse",
    name: "Crédit Agricole Toulouse 31",
    country: "FR",
  },
  {
    id: "nord-midi-pyrenees",
    name: "Crédit Agricole Nord Midi-Pyrénées",
    country: "FR",
  },
] as const;

export function findCaAspsp(id: string | null | undefined): CaAspspOption | null {
  if (!id) {
    return null;
  }
  return CA_ASPSPS.find((aspsp) => aspsp.id === id) ?? null;
}

/** Fallback : ASPSP d'env, sinon première région de la liste. */
export function resolveConnectAspsp(aspspId: string | null | undefined): CaAspspOption {
  const fromQuery = findCaAspsp(aspspId);
  if (fromQuery) {
    return fromQuery;
  }

  const envName = process.env.ENABLE_BANKING_ASPSP_NAME?.trim();
  if (envName) {
    return {
      id: "env",
      name: envName,
      country: process.env.ENABLE_BANKING_ASPSP_COUNTRY ?? "FR",
    };
  }

  return CA_ASPSPS[0];
}
