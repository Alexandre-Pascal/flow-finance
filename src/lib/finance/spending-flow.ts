/**
 * @file spending-flow.ts
 * @description Met en forme, pour un diagramme de Sankey, ce que les autres
 * modules calculent déjà : entrées (salaire, rentrées suivies), budget,
 * catégories de dépenses, épargne versée, et le reste. Aucune règle métier
 * nouvelle ici — uniquement l'assemblage en nœuds et liens.
 */

/** Poste du flux : une entrée, une catégorie ou une ligne de détail. */
export interface FlowEntry {
  key: string;
  name: string;
  color: string;
  amount: number;
  /** Lignes repliées quand l'entrée est un regroupement. */
  items?: FlowEntry[];
}

export const BUDGET_KEY = "__budget__";
export const REST_KEY = "__rest__";
export const SAVINGS_KEY = "__savings__";
export const OTHER_CATEGORIES_KEY = "__other_categories__";

export const BUDGET_COLOR = "#CA8A04";
export const REST_COLOR = "#94A3B8";
export const SAVINGS_COLOR = "#0F766E";
export const OTHER_CATEGORIES_COLOR = "#64748B";

export interface SpendingFlowNode {
  key: string;
  name: string;
  color: string;
  value: number;
  /** 0 entrées · 1 budget · 2 postes · 3 détail d'un poste. */
  depth: 0 | 1 | 2 | 3;
  /**
   * Lignes repliées dans ce nœud, pour les montrer au survol. Présent
   * uniquement quand elles expliquent tout son montant.
   */
  items?: FlowEntry[];
  /** Aucun lien ne part de ce nœud : il termine le flux, à droite. */
  isLeaf: boolean;
}

export interface SpendingFlowLink {
  /** Index dans `nodes` (format attendu par le Sankey de recharts). */
  source: number;
  target: number;
  value: number;
  color: string;
}

export interface SpendingFlow {
  nodes: SpendingFlowNode[];
  links: SpendingFlowLink[];
  income: number;
  /** Somme des postes (dépenses + épargne). */
  allocated: number;
  /** Ce qui n'est ni dépensé ni mis de côté. */
  rest: number;
  /** Dépassement quand les postes excèdent les entrées. */
  deficit: number;
  hasData: boolean;
}

export interface SpendingFlowLabels {
  budget: string;
  rest: string;
  /** Part d'une catégorie que le détail n'explique pas. */
  other: string;
  /** Regroupement des petits postes, quand on ne sait pas les compter. */
  otherCategories: string;
}

/** Nomme un regroupement d'après le nombre de lignes qu'il absorbe. */
export type GroupLabeller = (count: number) => string;

export interface SpendingFlowInput {
  /** Salaire, rentrées suivies, autres crédits. */
  incomes: FlowEntry[];
  /** Catégories de dépenses, plus l'épargne si elle est suivie. */
  categories: FlowEntry[];
  /** Détail par catégorie : abonnements par service, épargne par enveloppe… */
  details?: Record<string, FlowEntry[]>;
  labels: SpendingFlowLabels;
  /** Lignes de détail affichées par catégorie avant regroupement. */
  maxChildren?: number;
  /** Sous cette part de sa catégorie, une ligne rejoint « Autres ». */
  minChildShare?: number;
  /** Postes affichés séparément avant regroupement. */
  maxCategories?: number;
  /** Sous cette part des entrées, un poste rejoint « Autres postes ». */
  minCategoryShare?: number;
  /** Libellé du regroupement de postes, selon le nombre regroupé. */
  formatOtherCategories?: GroupLabeller;
  /** Libellé du regroupement de lignes de détail. */
  formatOtherLines?: GroupLabeller;
}

/** En dessous, un poste ne vaut pas un nœud (arrondis de centimes). */
const MIN_VALUE = 0.01;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sum(entries: FlowEntry[]): number {
  return round(entries.reduce((total, entry) => total + entry.amount, 0));
}

function keep(entries: FlowEntry[]): FlowEntry[] {
  return entries
    .filter((entry) => entry.amount > MIN_VALUE)
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Ramène les lignes de détail dans l'enveloppe de leur catégorie : on garde les
 * plus grosses, on tronque au total du parent, et le solde devient « Autres ».
 */
function fitChildren(
  children: FlowEntry[],
  parent: FlowEntry,
  maxChildren: number,
  minChildShare: number,
  otherLabel: string,
  formatOtherLines?: GroupLabeller,
): FlowEntry[] {
  const sorted = keep(children);
  const floor = parent.amount * minChildShare;
  const shown = sorted
    .filter((child) => child.amount >= floor)
    .slice(0, maxChildren);
  const hidden = sorted.filter((child) => !shown.includes(child));

  // Regrouper une ligne unique la renommerait sans rien simplifier.
  if (hidden.length === 1) {
    shown.push(hidden[0]);
    hidden.length = 0;
  }

  const fitted: FlowEntry[] = [];
  let used = 0;

  for (const child of shown) {
    const amount = round(Math.min(child.amount, parent.amount - used));
    if (amount <= MIN_VALUE) {
      break;
    }
    fitted.push({ ...child, amount });
    used = round(used + amount);
  }

  if (fitted.length === 0) {
    return [];
  }

  const left = round(parent.amount - used);
  if (left > MIN_VALUE) {
    // Le solde peut aussi contenir ce que le détail n'explique pas : on ne
    // promet la liste au survol que si elle en rend compte au centime près.
    const explained = Math.abs(round(sum(hidden) - left)) <= MIN_VALUE;
    fitted.push({
      key: `${parent.key}::other`,
      name:
        hidden.length > 0
          ? (formatOtherLines?.(hidden.length) ?? otherLabel)
          : otherLabel,
      color: parent.color,
      amount: left,
      items: hidden.length > 0 && explained ? hidden : undefined,
    });
  }

  return fitted;
}

/**
 * Un poste minuscule occupe autant de place qu'un gros dans un Sankey : sous le
 * seuil, ou au-delà du nombre affiché, il rejoint « Autres postes ». Un poste
 * isolé n'est jamais regroupé — « Autres » à une seule ligne n'apprend rien.
 */
function groupSmallCategories(
  categories: FlowEntry[],
  income: number,
  maxCategories: number,
  minCategoryShare: number,
  label: string,
  formatOtherCategories?: GroupLabeller,
): FlowEntry[] {
  const threshold = income * minCategoryShare;
  const kept: FlowEntry[] = [];
  const folded: FlowEntry[] = [];

  categories.forEach((entry, index) => {
    if (index < maxCategories && entry.amount >= threshold) {
      kept.push(entry);
    } else {
      folded.push(entry);
    }
  });

  if (folded.length === 1) {
    kept.push(folded[0]);
  } else if (folded.length > 1) {
    kept.push({
      key: OTHER_CATEGORIES_KEY,
      name: formatOtherCategories?.(folded.length) ?? label,
      color: OTHER_CATEGORIES_COLOR,
      amount: sum(folded),
      items: folded,
    });
  }

  return kept;
}

export function buildSpendingFlow({
  incomes,
  categories,
  details = {},
  labels,
  maxChildren = 6,
  minChildShare = 0.05,
  maxCategories = 8,
  minCategoryShare = 0.02,
  formatOtherCategories,
  formatOtherLines,
}: SpendingFlowInput): SpendingFlow {
  const sources = keep(incomes);
  const income = sum(sources);
  const postes = groupSmallCategories(
    keep(categories),
    income,
    maxCategories,
    minCategoryShare,
    labels.otherCategories,
    formatOtherCategories,
  );
  const allocated = sum(postes);
  const rest = round(income - allocated);

  const nodes: SpendingFlowNode[] = [];
  const links: SpendingFlowLink[] = [];
  const indexOf = new Map<string, number>();

  function addNode(node: SpendingFlowNode): number {
    const index = nodes.length;
    nodes.push(node);
    indexOf.set(node.key, index);
    return index;
  }

  for (const source of sources) {
    addNode({ ...source, value: source.amount, depth: 0, isLeaf: true });
  }

  // Le budget vaut ce qui entre : c'est lui qui se redistribue ensuite.
  const budgetIndex = addNode({
    key: BUDGET_KEY,
    name: labels.budget,
    color: BUDGET_COLOR,
    value: Math.max(income, allocated),
    depth: 1,
    isLeaf: true,
  });

  for (const source of sources) {
    links.push({
      source: indexOf.get(source.key) as number,
      target: budgetIndex,
      value: source.amount,
      color: source.color,
    });
  }

  const outgoing = [...postes];
  if (rest > MIN_VALUE) {
    outgoing.push({
      key: REST_KEY,
      name: labels.rest,
      color: REST_COLOR,
      amount: rest,
    });
  }

  for (const poste of outgoing) {
    const posteIndex = addNode({
      ...poste,
      value: poste.amount,
      depth: 2,
      isLeaf: true,
    });
    links.push({
      source: budgetIndex,
      target: posteIndex,
      value: poste.amount,
      color: poste.color,
    });

    for (const child of fitChildren(
      details[poste.key] ?? [],
      poste,
      maxChildren,
      minChildShare,
      labels.other,
      formatOtherLines,
    )) {
      const childIndex = addNode({
        ...child,
        value: child.amount,
        depth: 3,
        isLeaf: true,
      });
      links.push({
        source: posteIndex,
        target: childIndex,
        value: child.amount,
        color: child.color,
      });
    }
  }

  // Les nœuds sans suite terminent à droite du graphique : c'est ce qui décide
  // de la colonne où ils sont dessinés, donc de la place à leur réserver.
  const parents = new Set(links.map((link) => link.source));
  for (const [index, node] of nodes.entries()) {
    node.isLeaf = !parents.has(index);
  }

  return {
    nodes,
    links,
    income,
    allocated,
    rest: Math.max(0, rest),
    deficit: Math.max(0, round(allocated - income)),
    hasData: sources.length > 0 && postes.length > 0,
  };
}
