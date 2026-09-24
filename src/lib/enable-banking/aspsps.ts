/**
 * @file aspsps.ts
 * @description Banques proposées à la connexion.
 *
 * `name` et `country` doivent correspondre exactement à ce que renvoie
 * `GET /aspsps` chez Enable Banking — c'est ce couple qui identifie la banque
 * au moment d'ouvrir le flux d'autorisation.
 */

export interface ConnectAspspOption {
  id: string;
  name: string;
  country: string;
}

export const CONNECT_ASPSPS: readonly ConnectAspspOption[] = [
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
  {
    id: "revolut",
    name: "Revolut",
    country: "FR",
  },
] as const;

export function findConnectAspsp(id: string | null | undefined): ConnectAspspOption | null {
  if (!id) {
    return null;
  }
  return CONNECT_ASPSPS.find((aspsp) => aspsp.id === id) ?? null;
}

/** Repli : banque définie en variable d'env, sinon première de la liste. */
export function resolveConnectAspsp(aspspId: string | null | undefined): ConnectAspspOption {
  const fromQuery = findConnectAspsp(aspspId);
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

  return CONNECT_ASPSPS[0];
}
