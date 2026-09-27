/**
 * 排程判断引擎（纯函数，不依赖 Vue / Pinia / localStorage）
 *
 * 规则：
 * 1. 同一司机的驾驶时段不得重叠（休息区间会占用时段，任务也不能压进休息）。
 * 2. 自最近一次不少于 30 分钟的休息之后，累计驾驶达到 4 小时前，必须先休息 30 分钟。
 * 3. 休息区间由排程结果推导：先按时间累计驾驶时长，即将超限前在当前任务之后
 *    插入一个 30 分钟强制休息；若两个相邻任务之间天然间隔 >= 30 分钟，则视为
 *    已完成休息，累计清零。
 */
import type { Assignment, DriverDayPlan, Segment } from "./types";

/** 连续驾驶上限：4 小时 */
export const MAX_DRIVING_MIN = 240;
/** 强制休息时长：30 分钟 */
export const REST_MIN = 30;

const MIN = 60_000;

export interface ValidationResult {
  ok: boolean;
  /** 未通过的原因列表（展示给调度员，并写入待安排单） */
  errors: string[];
  /** 校验通过时，该方案新产生的强制休息（仅引擎推导用） */
  rests?: Segment[];
  /** 若失败，给出一个最早可用的建议发车时间（毫秒），便于一键填入 */
  suggestedStartMs?: number;
}

export interface Candidate {
  driverId: string;
  startMs: number;
  durationMin: number;
  /** 改派时传入当前 assignmentId，计算他人时段时排除自身 */
  excludeAssignmentId?: string;
}

function toSegment(a: Assignment): Segment {
  const startMs = new Date(a.start).getTime();
  return { startMs, endMs: startMs + a.durationMin * MIN };
}

/** 按开始时间排序的任务区间 */
function sortedTrips(assignments: Assignment[]): Array<Segment & { id: string }> {
  return assignments
    .map((a) => ({ ...toSegment(a), id: a.id }))
    .sort((x, y) => x.startMs - y.startMs);
}

/**
 * 由任务序列推导强制休息：
 * - 相邻任务间隔 >= 30 分钟，视为已休息，累计清零，间隔本身就是休息；
 * - 间隔不足 30 分钟，累计连续；加入下一任务会超过 4 小时，则在两任务之间
 *   （紧邻上一任务结束）插入 30 分钟强制休息，再从下一任务重新累计。
 */
export function deriveRests(segments: Array<Pick<Segment, "startMs" | "endMs">>): Segment[] {
  const trips = [...segments].sort((a, b) => a.startMs - b.startMs);
  const rests: Segment[] = [];
  let acc = 0; // 自上次有效休息后的累计驾驶分钟

  for (let i = 0; i < trips.length; i++) {
    if (i > 0) {
      const gap = trips[i].startMs - trips[i - 1].endMs;
      if (gap >= REST_MIN * MIN) {
        // 天然间隔即休息，累计清零
        acc = 0;
      }
    }
    const drive = (trips[i].endMs - trips[i].startMs) / MIN;
    if (acc + drive > MAX_DRIVING_MIN + 1e-6) {
      // 首趟本身就超过 4 小时无法通过插入休息解决，交由校验层报错
      if (i === 0) {
        acc += drive;
        continue;
      }
      // 接这一趟会冲破 4 小时：上一趟结束后必须先休 30 分钟
      rests.push({ startMs: trips[i - 1].endMs, endMs: trips[i - 1].endMs + REST_MIN * MIN });
      acc = drive;
    } else {
      acc += drive;
    }
  }
  return rests;
}

function overlaps(a: Segment, b: Segment): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * 校验一个派车方案能否通过排程。
 * @param others 该司机名下除本单外的既有排程
 */
export function validateCandidate(candidate: Candidate, others: Assignment[]): ValidationResult {
  const errors: string[] = [];
  const proposed: Segment = {
    startMs: candidate.startMs,
    endMs: candidate.startMs + candidate.durationMin * MIN
  };

  if (!Number.isFinite(candidate.startMs)) {
    return { ok: false, errors: ["发车时间无效"] };
  }
  if (candidate.durationMin <= 0) {
    return { ok: false, errors: ["预计用时必须大于 0"] };
  }
  if (candidate.durationMin > MAX_DRIVING_MIN) {
    errors.push(`单趟预计用时 ${candidate.durationMin} 分钟，超过连续驾驶上限 ${MAX_DRIVING_MIN} 分钟，请拆分任务`);
  }

  const existing = sortedTrips(others);

  // 规则 1：与既有任务时段不能重叠
  for (const trip of existing) {
    if (overlaps(proposed, trip)) {
      errors.push(
        `与既有任务时段重叠（${fmt(trip.startMs)}–${fmt(trip.endMs)}）`
      );
    }
  }

  // 规则 2：把本任务放进序列后推导强制休息，
  // 若强制休息与既有任务重叠，或既有任务间本来就需要休息却没排，均判不通过。
  const mergedTrips = [...existing, { ...proposed, id: candidate.excludeAssignmentId ?? "new" }]
    .sort((a, b) => a.startMs - b.startMs);
  const requiredRests = deriveRests(mergedTrips);

  for (const rest of requiredRests) {
    for (const trip of existing) {
      if (overlaps(rest, trip)) {
        errors.push(
          `需在 ${fmt(rest.startMs)}–${fmt(rest.endMs)} 休息 ${REST_MIN} 分钟，但该时段已有任务`
        );
      }
    }
    if (overlaps(rest, proposed)) {
      errors.push(
        `发车前连续驾驶将达 ${MAX_DRIVING_MIN} 分钟，需在 ${fmt(rest.startMs)}–${fmt(rest.endMs)} 先休息 ${REST_MIN} 分钟`
      );
    }
  }

  if (errors.length > 0) {
    // 建议：取本任务开始前最后一个任务（含其强制休息）的结束时间
    const before = mergedTrips
      .filter((t) => t.id !== "new" && t.endMs <= proposed.startMs + 1e-6)
      .sort((a, b) => b.endMs - a.endMs)[0];
    let suggested: number | undefined;
    if (before) {
      const acc = accumulatedAfterLastRest(before.endMs, existing);
      const nextCanStart =
        acc + candidate.durationMin > MAX_DRIVING_MIN + 1e-6
          ? before.endMs + REST_MIN * MIN
          : before.endMs;
      suggested = nextCanStart;
    } else {
      const first = existing[0];
      if (first) suggested = first.startMs;
    }
    return { ok: false, errors, suggestedStartMs: suggested };
  }

  return { ok: true, errors: [], rests: requiredRests };
}

/** 计算某时刻之后（紧贴该时刻）在不新增休息情况下，自上次有效休息起的累计驾驶分钟 */
function accumulatedAfterLastRest(atMs: number, trips: Array<Segment & { id?: string }>): number {
  const sorted = [...trips].sort((a, b) => a.startMs - b.startMs);
  let acc = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].endMs > atMs + 1e-6) break;
    if (i > 0 && sorted[i].startMs - sorted[i - 1].endMs >= REST_MIN * MIN) acc = 0;
    acc += (sorted[i].endMs - sorted[i].startMs) / MIN;
  }
  return acc;
}

/** 生成某司机在某一天 00:00–24:00 的时间轴（含跨天任务裁剪与休息推导） */
export function planDriverDay(
  driverId: string,
  dayStartMs: number,
  assignments: Assignment[]
): DriverDayPlan {
  const dayEndMs = dayStartMs + 24 * 60 * MIN;
  const own = assignments
    .filter((a) => a.driverId === driverId)
    .map((a) => ({ ...toSegment(a), orderId: a.orderId, assignmentId: a.id }));

  // 取当天开始的任务，以及前一天开始、跨过 00:00 的任务
  const inWindow = own.filter((t) => t.startMs < dayEndMs && t.endMs > dayStartMs);

  // 休息推导在完整序列上做，再裁剪到当天窗口
  const fullRests = deriveRests(own);
  const rests = fullRests
    .filter((r) => r.startMs < dayEndMs && r.endMs > dayStartMs)
    .map((r) => ({
      startMs: Math.max(r.startMs, dayStartMs),
      endMs: Math.min(r.endMs, dayEndMs)
    }));

  const trips = inWindow.map((t) => ({
    startMs: Math.max(t.startMs, dayStartMs),
    endMs: Math.min(t.endMs, dayEndMs),
    orderId: t.orderId,
    assignmentId: t.assignmentId,
    crossDay: t.startMs < dayStartMs || t.endMs > dayEndMs
  }));

  const drivingMinutes = trips.reduce((sum, t) => sum + (t.endMs - t.startMs) / MIN, 0);

  return { driverId, dayStartMs, trips, rests, drivingMinutes: Math.round(drivingMinutes) };
}

/** 毫秒时间戳 -> MM:HH 次日标记（仅错误提示用） */
function fmt(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatRange(startMs: number, endMs: number): string {
  return `${fmt(startMs)}–${fmt(endMs)}`;
}
