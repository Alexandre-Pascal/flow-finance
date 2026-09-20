import { describe, expect, it } from "vitest";
import {
  BUDGET_KEY,
  buildSpendingFlow,
  OTHER_CATEGORIES_KEY,
  REST_KEY,
  type FlowEntry,
} from "./spending-flow";

const labels = {
  budget: "Budget",
  rest: "Reste",
  other: "Autres",
  otherCategories: "Autres postes",
};

function entry(key: string, amount: number, name = key): FlowEntry {
  return { key, name, color: "#000000", amount };
}

function nodeByKey(
  flow: ReturnType<typeof buildSpendingFlow>,
  key: string,
) {
  return flow.nodes.find((node) => node.key === key);
}

function linkValue(
  flow: ReturnType<typeof buildSpendingFlow>,
  from: string,
  to: string,
) {
  const source = flow.nodes.findIndex((node) => node.key === from);
  const target = flow.nodes.findIndex((node) => node.key === to);
  return flow.links.find(
    (link) => link.source === source && link.target === target,
  )?.value;
}

describe("spending flow", () => {
  it("routes every income through the budget, then to each bucket", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1650), entry("rent-help", 110)],
      categories: [entry("housing", 800), entry("daily", 450)],
      labels,
    });

    expect(flow.income).toBe(1760);
    expect(flow.allocated).toBe(1250);
    expect(linkValue(flow, "salary", BUDGET_KEY)).toBe(1650);
    expect(linkValue(flow, BUDGET_KEY, "housing")).toBe(800);
    expect(nodeByKey(flow, BUDGET_KEY)?.depth).toBe(1);
    expect(nodeByKey(flow, "housing")?.depth).toBe(2);
    expect(flow.hasData).toBe(true);
  });

  it("shows what is left once every bucket is served", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1760)],
      categories: [entry("housing", 800)],
      labels,
    });

    expect(flow.rest).toBe(960);
    expect(nodeByKey(flow, REST_KEY)?.name).toBe("Reste");
    expect(linkValue(flow, BUDGET_KEY, REST_KEY)).toBe(960);
  });

  it("keeps no rest node when everything is allocated", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("housing", 1000)],
      labels,
    });

    expect(flow.rest).toBe(0);
    expect(nodeByKey(flow, REST_KEY)).toBeUndefined();
  });

  it("breaks a bucket into its own lines and names the leftover", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("subs", 100)],
      details: {
        subs: [entry("netflix", 20), entry("spotify", 12)],
      },
      labels,
    });

    expect(linkValue(flow, "subs", "netflix")).toBe(20);
    expect(linkValue(flow, "subs", "subs::other")).toBe(68);
    expect(nodeByKey(flow, "netflix")?.depth).toBe(3);
  });

  it("never lets the detail overflow its bucket", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("subs", 30)],
      details: {
        subs: [entry("netflix", 20), entry("spotify", 12), entry("icloud", 3)],
      },
      labels,
    });

    const children = flow.links
      .filter((link) => link.source === flow.nodes.findIndex((n) => n.key === "subs"))
      .reduce((total, link) => total + link.value, 0);

    expect(children).toBe(30);
    expect(nodeByKey(flow, "icloud")).toBeUndefined();
    expect(nodeByKey(flow, "subs::other")).toBeUndefined();
  });

  it("caps the number of detail lines and folds the rest into « other »", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("subs", 100)],
      details: {
        subs: [
          entry("a", 30),
          entry("b", 25),
          entry("c", 20),
          entry("d", 15),
        ],
      },
      labels,
      maxChildren: 2,
    });

    expect(linkValue(flow, "subs", "a")).toBe(30);
    expect(linkValue(flow, "subs", "b")).toBe(25);
    expect(linkValue(flow, "subs", "subs::other")).toBe(45);
  });

  it("folds the crumbs of a bucket into its « other » line", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("subs", 340)],
      details: {
        subs: [
          entry("rent", 300),
          entry("foodvisor", 24),
          entry("youtube", 13),
          entry("gym", 3),
        ],
      },
      labels,
    });

    // 13 € et 3 € pèsent moins de 5 % des 340 € du poste.
    expect(nodeByKey(flow, "youtube")).toBeUndefined();
    expect(linkValue(flow, "subs", "foodvisor")).toBe(24);
    expect(linkValue(flow, "subs", "subs::other")).toBe(16);
  });

  it("keeps a lone small line rather than hiding it behind « other »", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 2000)],
      categories: [entry("savings", 1245)],
      details: {
        savings: [entry("ldd", 1000), entry("pea", 200), entry("pel", 45)],
      },
      labels,
    });

    // 45 € pèse moins de 5 % du poste, mais le regrouper seul n'apprendrait rien.
    expect(linkValue(flow, "savings", "pel")).toBe(45);
    expect(nodeByKey(flow, "savings::other")).toBeUndefined();
  });

  it("names a group after the number of lines it swallows", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [
        entry("housing", 600),
        entry("food", 200),
        entry("fuel", 15),
        entry("bar", 12),
        entry("transport", 3),
      ],
      details: {
        housing: [
          entry("rent", 500),
          entry("power", 40),
          entry("water", 30),
          entry("wifi", 30),
        ],
      },
      labels,
      maxChildren: 2,
      formatOtherCategories: (count) => `${count} autres postes`,
      formatOtherLines: (count) => `${count} autres lignes`,
    });

    expect(nodeByKey(flow, OTHER_CATEGORIES_KEY)?.name).toBe("3 autres postes");
    expect(nodeByKey(flow, "housing::other")?.name).toBe("2 autres lignes");
  });

  it("folds the small buckets into one, without losing a cent", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [
        entry("housing", 600),
        entry("food", 200),
        entry("fuel", 15),
        entry("bar", 12),
        entry("transport", 3),
      ],
      labels,
    });

    expect(flow.nodes.map((node) => node.key)).toContain(OTHER_CATEGORIES_KEY);
    expect(linkValue(flow, BUDGET_KEY, OTHER_CATEGORIES_KEY)).toBe(30);
    expect(nodeByKey(flow, "fuel")).toBeUndefined();
    expect(flow.allocated).toBe(830);
    expect(flow.rest).toBe(170);
  });

  it("leaves a lone small bucket alone rather than naming it « other »", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("housing", 600), entry("transport", 3)],
      labels,
    });

    expect(nodeByKey(flow, "transport")?.value).toBe(3);
    expect(nodeByKey(flow, OTHER_CATEGORIES_KEY)).toBeUndefined();
  });

  it("caps how many buckets get their own branch", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [
        entry("a", 200),
        entry("b", 150),
        entry("c", 100),
        entry("d", 90),
      ],
      labels,
      maxCategories: 2,
    });

    expect(linkValue(flow, BUDGET_KEY, OTHER_CATEGORIES_KEY)).toBe(190);
  });

  it("reports the overspend when buckets exceed the income", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("housing", 1200)],
      labels,
    });

    expect(flow.deficit).toBe(200);
    expect(flow.rest).toBe(0);
    expect(nodeByKey(flow, BUDGET_KEY)?.value).toBe(1200);
  });

  it("carries what each group swallowed, for the hover detail", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [
        entry("housing", 600),
        entry("fuel", 15),
        entry("bar", 12),
        entry("transport", 3),
      ],
      details: {
        housing: [
          entry("rent", 500),
          entry("power", 40),
          entry("water", 30),
          entry("wifi", 30),
        ],
      },
      labels,
      maxChildren: 2,
    });

    expect(
      nodeByKey(flow, OTHER_CATEGORIES_KEY)?.items?.map((line) => [
        line.name,
        line.amount,
      ]),
    ).toEqual([
      ["fuel", 15],
      ["bar", 12],
      ["transport", 3],
    ]);

    // Les deux lignes repliées expliquent exactement le solde affiché.
    const other = nodeByKey(flow, "housing::other");
    expect(other?.value).toBe(60);
    expect(other?.items?.map((line) => line.name)).toEqual(["water", "wifi"]);
  });

  it("promises no hover detail when the group also covers an unexplained gap", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      // Le détail connu ne couvre que 323 des 400 € du poste.
      categories: [entry("subs", 400)],
      details: {
        subs: [
          entry("rent", 300),
          entry("gym", 10),
          entry("music", 8),
          entry("news", 5),
        ],
      },
      labels,
    });

    const other = nodeByKey(flow, "subs::other");
    expect(other?.value).toBe(100);
    expect(other?.items).toBeUndefined();
  });

  it("reports no data when an end of the flow is missing", () => {
    expect(
      buildSpendingFlow({ incomes: [], categories: [entry("a", 10)], labels })
        .hasData,
    ).toBe(false);
    expect(
      buildSpendingFlow({ incomes: [entry("a", 10)], categories: [], labels })
        .hasData,
    ).toBe(false);
  });

  it("drops the cents-level noise instead of drawing invisible nodes", () => {
    const flow = buildSpendingFlow({
      incomes: [entry("salary", 1000)],
      categories: [entry("housing", 999.995), entry("dust", 0.005)],
      labels,
    });

    expect(nodeByKey(flow, "dust")).toBeUndefined();
    expect(nodeByKey(flow, REST_KEY)).toBeUndefined();
  });
});
