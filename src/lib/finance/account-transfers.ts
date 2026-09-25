/**
 * @file account-transfers.ts
 * @description Virements entre deux comptes de l'utilisateur. Un tel mouvement
 * n'est ni une dépense ni un revenu : sans le reconnaître, il était compté deux
 * fois, en sortie ici et en entrée là.
 *
 * La contrepartie se lit dans le libellé, qui nomme le titulaire du compte visé
 * (« VIREMENT EMIS WEB M. PASCAL ALEXANDRE », « To ALEXANDRE JULIEN PASCAL &
 * ANAÏS ALICIA LACOMBE »). Comme pour les livrets et le PEA, la détection
 * s'appuie sur le libellé d'une seule transaction — jamais sur un appariement
 * avec les autres lignes, qui rendrait le résultat dépendant de ce qui a été
 * synchronisé et ferait bouger un budget passé sans que l'utilisateur agisse.
 */

import { accountLabel, defaultSpace } from "@/lib/finance/spaces";
import { isInternalTransfer } from "@/lib/pea/transfers";
import type {
  Account,
  AccountTransferRef,
  Space,
  TransactionWithAccount,
} from "@/types/database";

/** Civilités et liaisons à ignorer : elles ne distinguent personne. */
const NOISE_TOKENS = new Set([
  "M",
  "MR",
  "MME",
  "MLLE",
  "MONSIEUR",
  "MADAME",
  "OU",
  "ET",
  "DE",
  "DU",
  "LA",
  "LE",
]);

/** En dessous, un fragment ne distingue rien (« M », « DE », initiales). */
const MIN_TOKEN_LENGTH = 3;

/** Il faut au moins prénom + nom : « PASCAL » seul désigne aussi les parents. */
const MIN_MATCHING_TOKENS = 2;

/** Majuscules sans accents ni ponctuation, pour comparer un nom à un libellé. */
export function normalizeHolderLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Fragments significatifs du nom du titulaire d'un compte. */
export function holderTokens(name: string): string[] {
  return normalizeHolderLabel(name)
    .split(" ")
    .filter(
      (token) => token.length >= MIN_TOKEN_LENGTH && !NOISE_TOKENS.has(token),
    );
}

/**
 * Ce que le libellé permet d'affirmer.
 *
 * `counterpart` nomme un autre compte ; `self` dit seulement que l'argent reste
 * chez l'utilisateur, sans savoir d'où il vient ni où il va.
 */
export type AccountTransferMatch =
  | { kind: "counterpart"; account: Account }
  | { kind: "self" };

function holderScore(name: string, words: Set<string>): number {
  const tokens = holderTokens(name);
  if (tokens.length < MIN_MATCHING_TOKENS) {
    return 0;
  }
  return tokens.every((token) => words.has(token)) ? tokens.length : 0;
}

/**
 * Lit dans le libellé le compte de l'utilisateur désigné, s'il y en a un.
 *
 * Un compte n'est retenu que si **tous** ses fragments de nom figurent dans le
 * libellé : « PASCAL SOPHIE » (la mère) ne peut donc pas passer pour « PASCAL
 * ALEXANDRE ». Le nom le plus précis l'emporte — le compte joint, qui porte six
 * fragments, bat un compte perso qui n'en partage que deux.
 *
 * Quand le libellé ne fait que répéter le titulaire du compte concerné
 * (« VIREMENT EN VOTRE FAVEUR DE M. PASCAL ALEXANDRE »), aucun compte n'est
 * désigné : on sait que l'argent ne fait que circuler, pas d'où il vient.
 */
export function matchAccountTransfer(
  tx: Pick<TransactionWithAccount, "account_id" | "description">,
  accounts: Account[],
): AccountTransferMatch | null {
  const description = tx.description.toUpperCase();

  // Un compte manuel — une pocket Revolut — se reconnaît à un fragment
  // explicite du libellé. Il prime sur les noms de titulaires, bien plus
  // vagues, et se compare au libellé brut : « MB:cb78… » ne survivrait pas à
  // la normalisation des noms.
  for (const account of accounts) {
    if (account.id === tx.account_id) {
      continue;
    }
    for (const keyword of account.match_keywords ?? []) {
      const needle = keyword.trim().toUpperCase();
      if (needle.length >= 3 && description.includes(needle)) {
        return { kind: "counterpart", account };
      }
    }
  }

  const words = new Set(normalizeHolderLabel(tx.description).split(" "));

  let best: Account | null = null;
  let bestScore = 0;
  let selfScore = 0;

  for (const account of accounts) {
    const score = holderScore(account.name, words);
    if (score === 0) {
      continue;
    }

    if (account.id === tx.account_id) {
      selfScore = score;
      continue;
    }

    if (score > bestScore) {
      best = account;
      bestScore = score;
    }
  }

  // Un autre compte n'est nommé que si son nom est plus précis que celui du
  // compte porteur : sinon les deux titulaires se confondent.
  if (best && bestScore > selfScore) {
    return { kind: "counterpart", account: best };
  }
  if (selfScore > 0) {
    return { kind: "self" };
  }
  return best ? { kind: "counterpart", account: best } : null;
}

/**
 * Annote chaque transaction avec son éventuel virement vers un autre compte.
 *
 * `spaces` sert à savoir si le mouvement reste dans le même budget : un
 * virement vers le compte joint est une dépense, un virement entre deux de mes
 * comptes perso n'est rien.
 */
export function annotateAccountTransfers(
  transactions: TransactionWithAccount[],
  accounts: Account[],
  spaces: Space[] = [],
): TransactionWithAccount[] {
  if (accounts.length < 2) {
    return transactions;
  }

  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const fallbackSpaceId = defaultSpace(spaces)?.id ?? null;
  const spaceOf = (accountId: string | null | undefined): string | null =>
    accountId
      ? (accountById.get(accountId)?.space_id ?? fallbackSpaceId)
      : null;

  return transactions.map((tx) => {
    // Un versement sur un livret ou le PEA est déjà qualifié, et mieux : son
    // libellé nomme souvent le titulaire, ce qui suffirait à le faire passer
    // pour un simple déplacement entre comptes.
    if (!tx.transfer_manual && isInternalTransfer(tx)) {
      return { ...tx, account_transfer: null };
    }

    // Rattachement manuel : prime sur le libellé, comme pour les livrets.
    const match: AccountTransferMatch | null = tx.transfer_manual
      ? tx.transfer_account_id
        ? (() => {
            const account = accountById.get(tx.transfer_account_id as string);
            return account && account.id !== tx.account_id
              ? ({ kind: "counterpart", account } as const)
              : null;
          })()
        : null
      : matchAccountTransfer(tx, accounts);

    const counterpartId =
      match?.kind === "counterpart" ? match.account.id : null;
    const counterpartSpaceId = spaceOf(counterpartId);

    const account_transfer: AccountTransferRef | null = match
      ? {
          counterpart_account_id: counterpartId,
          counterpart_account_name:
            match.kind === "counterpart" ? accountLabel(match.account) : null,
          direction: tx.amount < 0 ? "out" : "in",
          counterpart_space_id: counterpartSpaceId,
          // Contrepartie inconnue : l'argent reste chez l'utilisateur, faute de
          // preuve qu'il change de budget.
          same_space:
            counterpartSpaceId === null ||
            counterpartSpaceId === spaceOf(tx.account_id),
        }
      : null;

    return { ...tx, account_transfer };
  });
}

/**
 * Virement d'un compte de l'utilisateur vers un autre : rien n'est dépensé ni
 * gagné, seulement déplacé.
 */
export function isAccountTransfer(
  tx: Pick<TransactionWithAccount, "account_transfer">,
): boolean {
  return tx.account_transfer != null;
}

/**
 * Virement d'un espace vers un autre : une dépense ici, une rentrée là-bas.
 * C'est la contribution au budget partagé.
 */
export function isCrossSpaceTransfer(
  tx: Pick<TransactionWithAccount, "account_transfer">,
): boolean {
  return tx.account_transfer != null && !tx.account_transfer.same_space;
}

/**
 * Mouvement qui ne compte ni en dépense ni en revenu.
 *
 * Distinct de `isInternalTransfer` : un virement vers un livret ou le PEA
 * alimente le patrimoine et nourrit le suivi d'épargne, alors qu'un virement
 * entre deux comptes courants ne produit rien du tout. Les deux sortent du
 * budget, mais un seul mérite d'être suivi ailleurs.
 */
export function isNeutralTransfer(
  tx: Pick<
    TransactionWithAccount,
    "savings_transfer" | "pea_transfer" | "account_transfer"
  >,
): boolean {
  // Un virement qui change de budget n'est pas neutre : il sort d'ici pour
  // entrer là-bas.
  return isInternalTransfer(tx) || (isAccountTransfer(tx) && !isCrossSpaceTransfer(tx));
}

/** Un compte créé à la main : son solde ne vient pas de la banque. */
export function isManualAccount(account: Account): boolean {
  return (account.match_keywords ?? []).length > 0;
}

/**
 * Reconstruit le solde des comptes manuels.
 *
 * L'argent d'une pocket a quitté le compte principal : la banque ne le déclare
 * nulle part. On le retrouve en cumulant les virements reconnus — une sortie du
 * compte principal est une entrée dans la pocket.
 */
export function withManualBalances(
  accounts: Account[],
  transactions: TransactionWithAccount[],
): Account[] {
  if (!accounts.some((account) => isManualAccount(account))) {
    return accounts;
  }

  const moved = new Map<string, number>();
  for (const tx of transactions) {
    const target = tx.account_transfer?.counterpart_account_id;
    if (!target) {
      continue;
    }
    moved.set(target, (moved.get(target) ?? 0) - tx.amount);
  }

  return accounts.map((account) =>
    isManualAccount(account)
      ? {
          ...account,
          balance:
            Math.round(
              ((account.base_balance ?? 0) + (moved.get(account.id) ?? 0)) * 100,
            ) / 100,
        }
      : account,
  );
}

/**
 * Fragment de libellé qui identifiera une pocket.
 *
 * Revolut suffixe ses virements internes d'un identifiant stable
 * (« MB:cb78bfe2-… ») : c'est lui qui désigne la pocket, le reste du libellé
 * étant la note tapée par l'utilisateur. Sans identifiant, on retombe sur le
 * libellé entier, à l'utilisateur de le raccourcir.
 */
export function suggestTransferKeyword(description: string): string {
  const pocket = description.match(/MB:[0-9a-fA-F-]{8,}/);
  return (pocket?.[0] ?? description).trim();
}
