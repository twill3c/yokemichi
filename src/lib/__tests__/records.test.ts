import { beforeEach, describe, expect, it } from "vitest";

import { loadRecords, submitRecord } from "@/lib/records";

/** localStorage の代わり。core と同じく、外の世界は注入して試す。 */
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  /** 試験用: 壊れた値を直接置く。 */
  poke(k: string, v: string) {
    this.m.set(k, v);
  }
  keys() {
    return [...this.m.keys()];
  }
}

let s: FakeStorage;
beforeEach(() => {
  s = new FakeStorage();
});

describe("T-070(F-14): 難度別の最良記録", () => {
  it("初回は保存される", () => {
    expect(loadRecords(s)).toEqual({});
    const r = submitRecord(s, "normal", 300);
    expect(r).toEqual({ normal: 300 });
    expect(loadRecords(s)).toEqual({ normal: 300 });
  });

  it("より長く生き延びたときだけ更新する", () => {
    submitRecord(s, "normal", 300);
    expect(submitRecord(s, "normal", 250)).toEqual({ normal: 300 });
    expect(submitRecord(s, "normal", 301)).toEqual({ normal: 301 });
  });

  it("難度ごとに独立している", () => {
    submitRecord(s, "easy", 100);
    submitRecord(s, "hard", 500);
    expect(loadRecords(s)).toEqual({ easy: 100, hard: 500 });
  });

  it("壊れた保存値は空として扱い、例外を投げない", () => {
    for (const junk of ["", "{", "null", "[]", '"文字列"', '{"normal":"数でない"}', "3"]) {
      s.poke("yokemichi.records.v1", junk);
      // 前提の検算: いま入っているのは正しい形ではない
      expect(() => loadRecords(s)).not.toThrow();
      expect(loadRecords(s)).toEqual({});
    }
  });

  it("壊れた保存値の上からでも保存できる(読めない値に引きずられない)", () => {
    s.poke("yokemichi.records.v1", "{壊");
    expect(submitRecord(s, "normal", 42)).toEqual({ normal: 42 });
    expect(loadRecords(s)).toEqual({ normal: 42 });
  });

  it("保存できない環境(private mode 等)でも落ちない", () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(() => submitRecord(broken, "normal", 10)).not.toThrow();
    expect(submitRecord(broken, "normal", 10)).toEqual({ normal: 10 });
  });

  it("鍵は一つだけ(散らかさない)", () => {
    submitRecord(s, "easy", 1);
    submitRecord(s, "hard", 2);
    expect(s.keys()).toEqual(["yokemichi.records.v1"]);
  });
});
