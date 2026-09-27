import "./env.mjs";
import assert from "node:assert";
import { useScheduleStore } from "./out/store.js";
import { nextTick } from "vue";
import { loadState } from "./out/storage.js";

const store = useScheduleStore();
let passed = 0;
const ok = (name, cond) => { assert.ok(cond, name); passed++; console.log("  ✓", name); };

// 种子：7 单，其中 o5 为 rejected → 待安排区有 o5、o6、o7
const pending = store.pendingOrders.map((o) => o.id);
console.log("1) 种子待安排区");
ok("待安排单为 o5/o6/o7", pending.join(",") === "o5,o6,o7");

const today = new Date().toISOString().slice(0, 10);

console.log("2) 重叠校验：给 o6 派 D1 09:30（撞上 a2 的 09:15–10:45）");
let r = store.schedule("o6", "D1", `${today}T09:30`, 60);
ok("被拒", r.ok === false);
ok("错误含重叠", r.errors.join("").includes("重叠"));
ok("o6 仍在待安排区", store.pendingOrders.some((o) => o.id === "o6"));
ok("尝试记录不占时段（同时段可派给其他司机）",
  store.schedule("o6", "D2", `${today}T09:30`, 60).ok === true);
// 还原 o6 到待安排
store.releaseToPending("o6");

console.log("3) 4小时规则：D1 已有 120+90（间隔15），11:00 再接 95 分被拒，建议 11:15");
r = store.schedule("o6", "D1", `${today}T11:00`, 95);
ok("被拒并提示休息", r.ok === false && r.errors.join("").includes("休息"));
const sug = new Date(r.suggestedStartMs);
ok("建议时间为 11:15", sug.getHours() === 11 && sug.getMinutes() === 15);
r = store.schedule("o6", "D1", `${today}T11:30`, 95);
ok("11:30（天然间隔45分）通过", r.ok === true);

console.log("4) 改派：a3（o3，D2 10:30 75分）改派 D1 15:00");
const before = store.assignmentByOrder.get("o3");
const beforeHist = before.history.length;
r = store.reassign("o3", "D1", `${today}T15:00`, 80, "司机临时交班");
ok("改派成功", r.ok === true);
const after = store.assignmentByOrder.get("o3");
ok("司机已换成 D1", after.driverId === "D1");
ok(`新增 1 条改派日志（${after.history.length} vs ${beforeHist}）`, after.history.length === beforeHist + 1);
const log = after.history.at(-1);
ok("日志含原因", log.reason === "司机临时交班");
ok("日志含旧司机 D2", log.oldDriverId === "D2");
ok("旧完成时间为 11:45", log.oldFinish === `${today}T11:45`);
ok("原 D2 10:30 时段已释放（可再派 o7）",
  store.schedule("o7", "D2", `${today}T10:30`, 75).ok === true);

console.log("5) 改派到冲突时段：仍释放原时段，单进待安排区，留痕保留");
const histLen = after.history.length;
r = store.reassign("o3", "D1", `${today}T08:00`, 60, "油站催单");
ok("新方案未通过（撞 a1 07:00–09:00）", r.ok === false);
const rejected = store.assignmentByOrder.get("o3");
ok("状态 rejected", rejected.status === "rejected");
ok("o3 在待安排区", store.pendingOrders.some((o) => o.id === "o3"));
ok("改派日志仍追加，含旧完成时间 16:20 与原因",
  rejected.history.length === histLen + 1 &&
  rejected.history.at(-1).oldFinish === `${today}T16:20` &&
  rejected.history.at(-1).reason === "油站催单");

await nextTick();
console.log("6) 持久化：重新 loadState 能恢复（模拟重开浏览器）");
const restored = loadState();
ok("订单数一致", restored.orders.length === store.orders.length);
const r3 = restored.assignments.find((a) => a.orderId === "o3");
ok("o3 改派历史完整恢复", r3.history.length === rejected.history.length && r3.status === "rejected");
ok("占用时段数据恢复（o1 仍在 D1 07:00）",
  restored.assignments.some((a) => a.orderId === "o1" && a.driverId === "D1" && a.start === `${today}T07:00`));

console.log(`\nSTORE TESTS: ALL ${passed} PASSED`);
