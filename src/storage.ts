import type { PersistedState } from "./types";
import { buildSeed } from "./data/seed";

/**
 * 本地保存层：只负责 localStorage 的读写与数据版本兜底，
 * 不包含任何排程规则，也不关心司机资料（司机换班可独立调整）。
 */
const STORAGE_KEY = "hxwlfront-19-driver-schedule-v1";
export const DATA_VERSION = 1;

export function loadState(): PersistedState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return buildSeed();
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.assignments)) {
      return buildSeed();
    }
    return {
      orders: parsed.orders,
      assignments: parsed.assignments,
      seq: parsed.seq ?? parsed.orders.length,
      version: parsed.version ?? DATA_VERSION
    };
  } catch {
    return buildSeed();
  }
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
