/**
 * @file jwt.ts
 * @description Génération des JWT RS256 pour authentifier les appels Enable Banking API.
 * @see https://enablebanking.com/docs/api/quick-start/
 */

import { SignJWT, importPKCS8 } from "jose";

const JWT_ISSUER = "enablebanking.com";
const JWT_AUDIENCE = "api.enablebanking.com";
const JWT_TTL_SECONDS = 3600;

/**
 * Charge la clé privée PEM depuis la variable d'environnement.
 */
async function loadPrivateKey(): Promise<CryptoKey> {
  const pem = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!pem) {
    throw new Error("ENABLE_BANKING_PRIVATE_KEY is not configured.");
  }

  return importPKCS8(pem, "RS256");
}

/**
 * Génère un JWT Bearer pour les requêtes Enable Banking.
 * @param appId - UUID de l'application (kid du JWT)
 */
export async function createEnableBankingJwt(appId: string): Promise<string> {
  const privateKey = await loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: appId })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + JWT_TTL_SECONDS)
    .sign(privateKey);
}

/**
 * Indique si Enable Banking est configuré (phase 2).
 */
export function isEnableBankingConfigured(): boolean {
  return Boolean(
    process.env.ENABLE_BANKING_APP_ID &&
      process.env.ENABLE_BANKING_PRIVATE_KEY &&
      process.env.ENABLE_BANKING_REDIRECT_URL,
  );
}
