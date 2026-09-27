import type { Driver } from "../types";

/**
 * 司机资料层：换班后由调度员在这里维护当班司机。
 * 与排程判断、本地保存解耦——引擎只认 driverId，存储层不关心司机字段。
 */
export const drivers: Driver[] = [
  { id: "D1", name: "王建国", truck: "豫A·7K21油", shift: "day", dutyDate: "" },
  { id: "D2", name: "李海峰", truck: "豫A·9T06油", shift: "day", dutyDate: "" },
  { id: "D3", name: "赵长顺", truck: "豫A·3M88油", shift: "night", dutyDate: "" }
];

export function getDriver(id: string): Driver | undefined {
  return drivers.find((d) => d.id === id);
}

export function shiftLabel(shift: Driver["shift"]): string {
  return shift === "day" ? "白班" : "夜班";
}
