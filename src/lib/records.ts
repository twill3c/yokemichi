/**
 * 難度別の最良記録(F-14)。
 *
 * 記録は「何 tick 生き延びたか」で、クリアすれば `ticks` に達する。
 * localStorage を直接触らず**注入する** —— 保存の失敗(private mode・容量超過)は
 * 例外で飛んでくるので、遊びを止めないために握るが、**読めない値は空として扱う**。
 */
export type DifficultyKey = "easy" | "normal" | "hard";
export type Records = Partial<Record<DifficultyKey, number>>;

/** `localStorage` のうち、ここで使う部分だけ。 */
export interface RecordStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "yokemichi.records.v1";
const KEYS: DifficultyKey[] = ["easy", "normal", "hard"];

export function loadRecords(store: RecordStore): Records {
  let raw: string | null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return {};
  }
  if (raw === null) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  // 値の形も確かめる。数でないものが入っていたら、その難度だけ捨てる。
  const out: Records = {};
  for (const k of KEYS) {
    const v = (parsed as Record<string, unknown>)[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** 記録を出す。より長く生き延びたときだけ更新し、更新後の全体を返す。 */
export function submitRecord(
  store: RecordStore,
  difficulty: DifficultyKey,
  ticks: number,
): Records {
  const cur = loadRecords(store);
  const best = cur[difficulty];
  if (best !== undefined && best >= ticks) return cur;

  const next: Records = { ...cur, [difficulty]: ticks };
  try {
    store.setItem(KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても遊びは続けられる。画面には今回の値を返す。
  }
  return next;
}
