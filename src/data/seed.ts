import type { PersistedState } from "../types";
import { todayStr } from "../utils/time";

/**
 * 首次打开时的演示数据：基于“今天”生成，包含
 * - 已排程任务（含累计驾驶接近 4 小时触发的强制休息）
 * - 一条带改派留痕的任务
 * - 一条校验未通过、留在待安排区的单
 */
export function buildSeed(): PersistedState {
  const today = todayStr();
  const now = new Date().toISOString();

  const orders: PersistedState["orders"] = [
    { id: "o1", code: `PD-${today.replace(/-/g, "")}-001`, station: "城东站", fuel: "92号汽油", tons: 18, arriveAt: today, notes: "早高峰前补库", createdAt: now },
    { id: "o2", code: `PD-${today.replace(/-/g, "")}-002`, station: "机场站", fuel: "柴油", tons: 12, arriveAt: today, notes: "加注航油车辆", createdAt: now },
    { id: "o3", code: `PD-${today.replace(/-/g, "")}-003`, station: "新区站", fuel: "95号汽油", tons: 10, arriveAt: today, notes: "原派王建国，车辆保养改派", createdAt: now },
    { id: "o4", code: `PD-${today.replace(/-/g, "")}-004`, station: "机场站", fuel: "92号汽油", tons: 16, arriveAt: today, notes: "夜间航班补班", createdAt: now },
    { id: "o5", code: `PD-${today.replace(/-/g, "")}-005`, station: "新区站", fuel: "柴油", tons: 20, arriveAt: today, notes: "工地集中加注", createdAt: now },
    { id: "o6", code: `PD-${today.replace(/-/g, "")}-006`, station: "城东站", fuel: "95号汽油", tons: 8, arriveAt: today, notes: "纸面顺序第 6 单", createdAt: now },
    { id: "o7", code: `PD-${today.replace(/-/g, "")}-007`, station: "机场站", fuel: "柴油", tons: 14, arriveAt: today, notes: "等调度安排", createdAt: now }
  ];

  const assignments: PersistedState["assignments"] = [
    // D1 王建国：120 + 90 分钟，间隔 15 分，再接单即累计 240 分边界附近
    {
      id: "a1", orderId: "o1", driverId: "D1",
      start: `${today}T07:00`, durationMin: 120, status: "arrived",
      history: [], createdAt: now, updatedAt: now
    },
    {
      id: "a2", orderId: "o2", driverId: "D1",
      start: `${today}T09:15`, durationMin: 90, status: "enroute",
      history: [], createdAt: now, updatedAt: now
    },
    // o3：从 D1 改派给 D2，留有原因与旧完成时间
    {
      id: "a3", orderId: "o3", driverId: "D2",
      start: `${today}T10:30`, durationMin: 75, status: "scheduled",
      history: [
        {
          at: now,
          reason: "王建国车辆豫A·7K21保养，改由李海峰承运",
          oldDriverId: "D1",
          oldStart: `${today}T10:00`,
          oldDurationMin: 75,
          oldFinish: `${today}T11:15`
        }
      ],
      createdAt: now, updatedAt: now
    },
    // D3 夜班里有一条任务
    {
      id: "a4", orderId: "o4", driverId: "D3",
      start: `${today}T20:00`, durationMin: 100, status: "scheduled",
      history: [], createdAt: now, updatedAt: now
    },
    // o5：派给 D1 的 11:30，与 a2（09:15–10:45）不撞时，但再接单累计
    // 120+15+90+45（gap）+95 -> 插入休息后休息 10:45–11:15 与 11:30 不冲突，
    // 这里演示“未通过排程”：派 11:00 发车会撞上强制休息
    {
      id: "a5", orderId: "o5", driverId: "D1",
      start: `${today}T11:00`, durationMin: 95, status: "rejected",
      rejectReason: "未通过排程：10:45 起需强制休息 30 分钟，11:00 发车与休息时段冲突；同时累计驾驶将达 4 小时",
      history: [], createdAt: now, updatedAt: now
    }
  ];

  return { orders, assignments, seq: 7, version: 1 };
}
