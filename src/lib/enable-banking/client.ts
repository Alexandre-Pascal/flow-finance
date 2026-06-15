/**
 * @file client.ts
 * @description Client HTTP Enable Banking (AIS — Account Information Service).
 */

import { createEnableBankingJwt } from "./jwt";
import type {
  EnableBankingAspsp,
  EnableBankingAuthResponse,
  EnableBankingBalancesResponse,
  EnableBankingSessionResponse,
  EnableBankingTransactionsResponse,
} from "./types";

const API_BASE = "https://api.enablebanking.com";

async function getAuthHeaders(): Promise<HeadersInit> {
  const appId = process.env.ENABLE_BANKING_APP_ID;

  if (!appId) {
    throw new Error("ENABLE_BANKING_APP_ID is not configured.");
  }

  const jwt = await createEnableBankingJwt(appId);

  return {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  };
}

/**
 * Démarre le flux d'autorisation OAuth auprès d'une banque (ASPSP).
 */
export async function startAuthorization(params: {
  aspsp: EnableBankingAspsp;
  redirectUrl: string;
  state: string;
  validUntil: string;
}): Promise<EnableBankingAuthResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/auth`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      access: { valid_until: params.validUntil },
      aspsp: params.aspsp,
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: "personal",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Enable Banking auth failed: ${response.status} ${body}`);
  }

  return response.json();
}

/**
 * Échange le code OAuth contre une session et la liste des comptes autorisés.
 */
export async function createSession(
  code: string,
): Promise<EnableBankingSessionResponse> {
  const headers = await getAuthHeaders();

  const response = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Enable Banking session failed: ${response.status} ${body}`,
    );
  }

  return response.json();
}

/**
 * Récupère les transactions d'un compte (avec pagination via continuation_key).
 */
export async function fetchTransactions(
  accountUid: string,
  options?: {
    dateFrom?: string;
    strategy?: "default" | "longest";
    continuationKey?: string;
  },
): Promise<EnableBankingTransactionsResponse> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams();

  if (options?.dateFrom) {
    params.set("date_from", options.dateFrom);
  }
  if (options?.strategy) {
    params.set("strategy", options.strategy);
  }
  if (options?.continuationKey) {
    params.set("continuation_key", options.continuationKey);
  }

  const query = params.toString();
  const url = `${API_BASE}/accounts/${accountUid}/transactions${query ? `?${query}` : ""}`;

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Enable Banking transactions failed: ${response.status} ${body}`,
    );
  }

  return response.json();
}

/**
 * Récupère le solde courant d'un compte.
 */
export async function fetchBalances(
  accountUid: string,
): Promise<EnableBankingBalancesResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/accounts/${accountUid}/balances`, {
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Enable Banking balances failed: ${response.status} ${body}`,
    );
  }

  return response.json();
}
