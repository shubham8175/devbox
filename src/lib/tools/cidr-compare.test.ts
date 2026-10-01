import { describe, expect, it } from "vitest";
import { CIDR_COMPARE_SAMPLE, compareCidrs, rangeToCidrs, splitCidrPaste, toCidrEntries } from "@/lib/tools/cidr-compare";

const run = (values: string[]) => compareCidrs(toCidrEntries(values));
const relations = (values: string[]) => run(values).pairs.map((p) => `${p.a.line}-${p.b.line}:${p.relation}`);

describe("cidr compare", () => {
  it("analyses the sample VPC", () => {
    const r = run(CIDR_COMPARE_SAMPLE);
    expect(r.valid).toHaveLength(5);
    expect(r.conflicts.map((p) => p.text)).toEqual([
      "#2 10.0.1.0/24 is inside #1 10.0.0.0/16",
      "#3 10.0.2.0/24 is inside #1 10.0.0.0/16",
      "#4 10.0.1.128/25 is inside #1 10.0.0.0/16",
      "#4 10.0.1.128/25 is inside #2 10.0.1.0/24",
    ]);
    expect(r.unionSize).toBe(65536 + 256);
    expect(r.supernet).toEqual({ cidr: "0.0.0.0/0", size: 2 ** 32 });
    expect(r.collapsed).toEqual(["10.0.0.0/16", "192.168.0.0/24"]);
    // 10.0.1.0/24 and 10.0.2.0/24 touch, but both sit inside #1, so they aren't flagged.
    expect(r.adjacent).toEqual([]);
  });

  it("skips adjacent pairs already covered by another listed range", () => {
    expect(run(["10.0.0.0/16", "10.0.0.0/24", "10.0.1.0/24"]).adjacent).toEqual([]);
    // Without the covering /16 the same pair is reported (and mergeable).
    expect(run(["10.0.0.0/24", "10.0.1.0/24"]).adjacent.map((p) => p.mergesInto)).toEqual(["10.0.0.0/23"]);
    // Only one of the pair inside another range: still reported.
    expect(run(["10.0.0.0/23", "10.0.1.0/24", "10.0.2.0/24"]).adjacent.map((p) => p.text)).toEqual([
      "#3 10.0.2.0/24 starts right after #1 10.0.0.0/23 ends",
      "#3 10.0.2.0/24 starts right after #2 10.0.1.0/24 ends",
    ]);
  });

  it("classifies identical, containment and disjoint pairs", () => {
    expect(relations(["10.0.0.0/24", "10.0.0.0/24", "10.0.0.0/8", "172.16.0.0/12"])).toEqual([
      "1-2:identical",
      "1-3:b-contains-a",
      "1-4:disjoint",
      "2-3:b-contains-a",
      "2-4:disjoint",
      "3-4:disjoint",
    ]);
  });

  it("treats a bare IP as /32 and normalises host addresses", () => {
    const r = run(["10.0.0.5/24", "10.0.0.77"]);
    const [a, b] = r.valid;
    expect(a.cidr).toBe("10.0.0.0/24");
    expect(a.normalizedFrom).toBe("10.0.0.5/24");
    expect(b.cidr).toBe("10.0.0.77/32");
    expect(b.normalizedFrom).toBeNull();
    expect(r.conflicts[0].text).toBe("#2 10.0.0.77/32 is inside #1 10.0.0.0/24");
  });

  it("detects adjacency and when it's mergeable", () => {
    const mergeable = run(["10.0.1.0/24", "10.0.0.0/24"]);
    expect(mergeable.adjacent[0].mergesInto).toBe("10.0.0.0/23");
    expect(mergeable.adjacent[0].text).toBe("#1 10.0.1.0/24 starts right after #2 10.0.0.0/24 ends — together they form 10.0.0.0/23");
    expect(mergeable.collapsed).toEqual(["10.0.0.0/23"]);
    expect(mergeable.conflicts).toEqual([]);

    // Adjacent but misaligned: 10.0.1.0/24 + 10.0.2.0/24 isn't a /23.
    const misaligned = run(["10.0.1.0/24", "10.0.2.0/24"]);
    expect(misaligned.adjacent[0].mergesInto).toBeNull();
    expect(misaligned.collapsed).toEqual(["10.0.1.0/24", "10.0.2.0/24"]);
    expect(misaligned.supernet?.cidr).toBe("10.0.0.0/22");
  });

  it("counts the union without double counting", () => {
    const r = run(["10.0.0.0/24", "10.0.0.0/25", "10.0.0.128/25", "10.0.1.0/32"]);
    expect(r.unionSize).toBe(257);
    expect(r.collapsed).toEqual(["10.0.0.0/24", "10.0.1.0/32"]);
  });

  it("keeps errors per field and ignores empty fields", () => {
    const r = run(["10.0.0.0/24", "", "nope", "10.0.0.0/33"]);
    expect(r.entries.map((e) => [e.line, e.ok])).toEqual([[1, true], [3, false], [4, false]]);
    expect(r.valid).toHaveLength(1);
    expect(r.pairs).toEqual([]);
  });

  it("handles the whole address space", () => {
    const r = run(["0.0.0.0/0", "255.255.255.255"]);
    expect(r.unionSize).toBe(2 ** 32);
    expect(r.collapsed).toEqual(["0.0.0.0/0"]);
    expect(r.conflicts[0].relation).toBe("a-contains-b");
  });
});

describe("rangeToCidrs", () => {
  it("splits ranges into the fewest blocks", () => {
    expect(rangeToCidrs(0, 2 ** 32 - 1)).toEqual(["0.0.0.0/0"]);
    // 10.0.0.1 – 10.0.0.6
    expect(rangeToCidrs(167772161, 167772166)).toEqual(["10.0.0.1/32", "10.0.0.2/31", "10.0.0.4/31", "10.0.0.6/32"]);
  });
});

describe("splitCidrPaste", () => {
  it("splits on newlines, commas and spaces but keeps dotted masks with their address", () => {
    expect(splitCidrPaste("10.0.0.0/16, 10.0.1.0/24\n192.168.0.1 255.255.255.0  8.8.8.8;1.1.1.1")).toEqual([
      "10.0.0.0/16",
      "10.0.1.0/24",
      "192.168.0.1 255.255.255.0",
      "8.8.8.8",
      "1.1.1.1",
    ]);
  });
});
