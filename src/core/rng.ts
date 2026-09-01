/**
 * シード付き擬似乱数(mulberry32)。
 *
 * N-01 により core は `Math.random()` を呼ばない。乱数は必ずここで作って注入する。
 * 32 bit の状態しか持たないので暗号用途には使えないが、
 * このプロジェクトが要求するのは**同じシードなら同じ面**という再現性だけである(F-13)。
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
