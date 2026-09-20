import { describe, expect, it } from "vitest";
import {
  BUDGET_KEY,
  buildSpendingFlow,
  REST_KEY,
  type FlowEntry,
} from "./spending-flow";

const labels = { budget: "Budget", rest: "Reste", other: "Autres" };

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
