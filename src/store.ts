import { computed, reactive, watch } from "vue";
import { defineStore } from "pinia";
import type { Assignment, DeliveryOrder, PersistedState, ReassignLog } from "./types";
import { loadState, saveState } from "./storage";
import { buildSeed } from "./data/seed";
import { planDriverDay, validateCandidate } from "./scheduler";
import { drivers } from "./data/drivers";
import { finishOf, toMs, todayStr } from "./utils/time";

export interface ScheduleOutcome {
  ok: boolean;
  errors: string[];
  suggestedStartMs?: number;
}

interface NewOrderInput {
  station: string;
  fuel: string;
  tons: number;
  arriveAt: string;
  notes: string;
}

const ACTIVE: Assignment["status"][] = ["scheduled", "enroute", "arrived"];

export const useScheduleStore = defineStore("schedule", () => {
  const initial = loadState();
  const state = reactive<PersistedState>({ ...initial });

  // 重开浏览器即恢复：任何变化都写回 localStorage（占用时段/休息/待安排单均在内）
  watch(
    () => state,
    (value) => {
      saveState({
        orders: value.orders,
        assignments: value.assignments,
        seq: value.seq,
        version: value.version
      });
    },
    { deep: true }
  );

  /* ---------- 查询 ---------- */

  const orders = computed(() => state.orders);
  const assignments = computed(() => state.assignments);

  const assignmentByOrder = computed(() => {
    const map = new Map<string, Assignment>();
    for (const a of state.assignments) map.set(a.orderId, a);
    return map;
  });

  function orderById(id: string): DeliveryOrder | undefined {
    return state.orders.find((o) => o.id === id);
  }

  /** 待安排区：没有任何排程记录，或最近一次排程被驳回（rejected 不占时段） */
  const pendingOrders = computed(() =>
    state.orders.filter((o) => {
      const a = assignmentByOrder.value.get(o.id);
      return !a || a.status === "rejected";
    })
  );

  /** 某司机名下占用时段的排程（rejected 的尝试不参与引擎计算） */
  function activeAssignmentsOf(driverId: string, excludeId?: string): Assignment[] {
    return state.assignments.filter(
      (a) => a.driverId === driverId && ACTIVE.includes(a.status) && a.id !== excludeId
    );
  }

  function dayAssignments(date: string): Assignment[] {
    return state.assignments
      .filter((a) => ACTIVE.includes(a.status) && a.start.startsWith(date))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function driverDayPlan(driverId: string, date: string) {
    return planDriverDay(driverId, toMs(`${date}T00:00`), state.assignments.filter((a) => ACTIVE.includes(a.status)));
  }

  function nextCode(): string {
    state.seq += 1;
    return `PD-${todayStr().replace(/-/g, "")}-${String(state.seq).padStart(3, "0")}`;
  }

  /* ---------- 写操作 ---------- */

  function addOrder(input: NewOrderInput): DeliveryOrder {
    const order: DeliveryOrder = {
      id: crypto.randomUUID(),
      code: nextCode(),
      station: input.station,
      fuel: input.fuel,
      tons: input.tons,
      arriveAt: input.arriveAt || todayStr(),
      notes: input.notes,
      createdAt: new Date().toISOString()
    };
    state.orders.unshift(order);
    return order;
  }

  /** 派单：新建或更新某订单的排程尝试；不通过则记录原因，单留在待安排区 */
  function schedule(
    orderId: string,
    driverId: string,
    startLocal: string,
    durationMin: number
  ): ScheduleOutcome {
    const existing = assignmentByOrder.value.get(orderId);
    const result = validateCandidate(
      { driverId, startMs: toMs(startLocal), durationMin, excludeAssignmentId: existing?.id },
      activeAssignmentsOf(driverId, existing?.id)
    );

    const now = new Date().toISOString();
    if (!result.ok) {
      const rejected: Assignment = {
        id: existing?.id ?? crypto.randomUUID(),
        orderId,
        driverId,
        start: startLocal,
        durationMin,
        status: "rejected",
        rejectReason: result.errors.join("；"),
        history: existing?.history ?? [],
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      upsert(rejected);
      return { ok: false, errors: result.errors, suggestedStartMs: result.suggestedStartMs };
    }

    const scheduled: Assignment = {
      id: existing?.id ?? crypto.randomUUID(),
      orderId,
      driverId,
      start: startLocal,
      durationMin,
      status: "scheduled",
      history: existing?.history ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    delete (scheduled as Partial<Assignment>).rejectReason;
    upsert(scheduled);
    return { ok: true, errors: [] };
  }

  /**
   * 改派活跃排程：无论新时段是否通过，都先释放原时段（同一条记录原地更新），
   * 并留下改派原因与旧完成时间。若原记录未占时段（rejected/无记录），等同普通派单。
   */
  function reassign(
    orderId: string,
    newDriverId: string,
    newStartLocal: string,
    newDurationMin: number,
    reason: string
  ): ScheduleOutcome {
    const old = assignmentByOrder.value.get(orderId);
    if (!old || !ACTIVE.includes(old.status)) {
      return schedule(orderId, newDriverId, newStartLocal, newDurationMin);
    }

    const log: ReassignLog = {
      at: new Date().toISOString(),
      reason: reason || "未填写改派原因",
      oldDriverId: old.driverId,
      oldStart: old.start,
      oldDurationMin: old.durationMin,
      oldFinish: finishOf(old.start, old.durationMin)
    };

    const result = validateCandidate(
      { driverId: newDriverId, startMs: toMs(newStartLocal), durationMin: newDurationMin, excludeAssignmentId: old.id },
      activeAssignmentsOf(newDriverId, old.id)
    );

    const now = new Date().toISOString();
    const next: Assignment = {
      ...old,
      driverId: newDriverId,
      start: newStartLocal,
      durationMin: newDurationMin,
      status: result.ok ? "scheduled" : "rejected",
      rejectReason: result.ok ? undefined : result.errors.join("；"),
      history: [...old.history, log],
      updatedAt: now
    };
    if (result.ok) delete next.rejectReason;
    upsert(next);

    return {
      ok: result.ok,
      errors: result.errors,
      suggestedStartMs: result.suggestedStartMs
    };
  }

  /** 状态流转：已排程 -> 运输中 -> 已到站（不改变占用时段）；rejected 须重新派单 */
  function advanceStatus(assignment: Assignment) {
    const flow: Partial<Record<Assignment["status"], Assignment["status"]>> = {
      scheduled: "enroute",
      enroute: "arrived"
    };
    const next = flow[assignment.status];
    if (next) {
      assignment.status = next;
      assignment.updatedAt = new Date().toISOString();
    }
  }

  function removeOrder(orderId: string) {
    state.orders = state.orders.filter((o) => o.id !== orderId);
    state.assignments = state.assignments.filter((a) => a.orderId !== orderId);
  }

  /** 释放某单的占用时段，退回待安排区（保留最近参数与历史） */
  function releaseToPending(orderId: string) {
    const a = assignmentByOrder.value.get(orderId);
    if (a && ACTIVE.includes(a.status)) {
      a.status = "rejected";
      a.rejectReason = "调度员手动释放时段，等待重新安排";
      a.updatedAt = new Date().toISOString();
    }
  }

  function resetDemo() {
    const seed = buildSeed();
    state.orders = seed.orders;
    state.assignments = seed.assignments;
    state.seq = seed.seq;
    state.version = seed.version;
  }

  function upsert(assignment: Assignment) {
    const index = state.assignments.findIndex((a) => a.id === assignment.id);
    if (index >= 0) state.assignments[index] = assignment;
    else state.assignments.push(assignment);
  }

  return {
    // data
    state,
    drivers,
    orders,
    assignments,
    pendingOrders,
    // queries
    assignmentByOrder,
    orderById,
    activeAssignmentsOf,
    dayAssignments,
    driverDayPlan,
    // actions
    addOrder,
    schedule,
    reassign,
    advanceStatus,
    removeOrder,
    releaseToPending,
    resetDemo
  };
});
