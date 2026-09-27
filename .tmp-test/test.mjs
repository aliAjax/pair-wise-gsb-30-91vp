import assert from "node:assert";
import { validateCandidate, deriveRests, planDriverDay, MAX_DRIVING_MIN, REST_MIN } from "./scheduler.mjs";

const MS = 60_000;
const base = new Date("2026-09-27T00:00").getTime();
const at = (h, m = 0) => base + (h * 60 + m) * MS;

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log("  ✓", name);
}

function assignment(id, h, m, dur, extra = {}) {
  return {
    id, orderId: "o" + id, driverId: "D1",
    start: new Date(at(h, m)).toISOString().replace("Z", ""),
    durationMin: dur, status: "scheduled", history: [],
    createdAt: "", updatedAt: "",
    ...extra
  };
}

// deriveRests 内部用本地时间比较，为避免时区干扰，直接用毫秒构造段
const seg = (sH, sM, eH, eM) => ({ startMs: at(sH, sM), endMs: at(eH, eM) });

console.log("1) 天然间隔 ≥30 分钟 → 不产生强制休息，累计清零");
check("120分 + 间隔30分 + 120分，无休息块", () => {
  const rests = deriveRests([seg(8, 0, 10, 0), seg(10, 30, 12, 30)]);
  assert.equal(rests.length, 0);
});

console.log("2) 间隔 <30 分钟且累计将超 240 → 在两趟之间插入休息");
check("120+90 间隔15，再加95（仍间隔15）→ 1 个休息块，紧贴上一趟结束", () => {
  const rests = deriveRests([seg(7, 0, 9, 0), seg(9, 15, 10, 45), seg(11, 0, 12, 35)]);
  assert.equal(rests.length, 1);
  assert.equal(rests[0].startMs, at(10, 45));
  assert.equal(rests[0].endMs, at(11, 15));
});

console.log("3) 恰好累计 240 分不违规，240+任意正时长才需要休息");
check("120+120 间隔15 = 240，无休息", () => {
  assert.equal(deriveRests([seg(7, 0, 9, 0), seg(9, 15, 11, 15)]).length, 0);
});
check("120+121 间隔15 = 241，有休息", () => {
  assert.equal(deriveRests([seg(7, 0, 9, 0), seg(9, 15, 11, 16)]).length, 1);
});

console.log("4) validateCandidate: 时段重叠被拒");
check("与既有任务重叠 → ok=false 且错误提到重叠", () => {
  const others = [assignment("a1", 8, 0, 120)];
  const r = validateCandidate({ driverId: "D1", startMs: at(9, 0), durationMin: 60 }, others);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(""), /重叠/);
});

console.log("5) validateCandidate: 4小时前先休息——把单排进应休息的时段被拒");
check("已有 120+90（间隔15），11:00 发 95 分 → 拒绝（休息10:45-11:15 被占）", () => {
  const others = [assignment("a1", 7, 0, 120), assignment("a2", 9, 15, 90)];
  const r = validateCandidate({ driverId: "D1", startMs: at(11, 0), durationMin: 95 }, others);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(""), /休息/);
});

console.log("6) 留出 ≥30 分钟天然间隔则通过且无需额外休息块");
check("同序列，11:30 发 95 分（与上一趟间隔 45 分，天然休息）→ ok=true，无额外休息", () => {
  const others = [assignment("a1", 7, 0, 120), assignment("a2", 9, 15, 90)];
  const r = validateCandidate({ driverId: "D1", startMs: at(11, 30), durationMin: 95 }, others);
  assert.equal(r.ok, true, r.errors.join(";"));
  assert.equal(r.rests.length, 0);
});

console.log("7) 单趟超过 240 分钟直接拒绝");
check("单趟 241 分 → ok=false", () => {
  const r = validateCandidate({ driverId: "D1", startMs: at(8), durationMin: 241 }, []);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(""), new RegExp(MAX_DRIVING_MIN));
});

console.log("8) 建议发车时间：之前的任务结束后（需要休息则加30分）");
check("拒绝结果 suggestedStartMs = 10:45 + 30 = 11:15", () => {
  const others = [assignment("a1", 7, 0, 120), assignment("a2", 9, 15, 90)];
  const r = validateCandidate({ driverId: "D1", startMs: at(11, 0), durationMin: 95 }, others);
  assert.equal(r.suggestedStartMs, at(11, 15));
});

console.log("9) planDriverDay: 跨天任务裁剪与休息推导");
check("前夜 23:00 发 90 分的任务出现在次日轴内（被裁剪为 00:00-00:30）", () => {
  const prevDay = base - 24 * 60 * MS;
  const cross = assignment("ax", 23, 0, 90);
  // start 需要落在前一天 23:00（本地）
  cross.start = new Date(prevDay + 23 * 60 * MS).toISOString().replace("Z", "");
  const plan = planDriverDay("D1", base, [cross]);
  assert.equal(plan.trips.length, 1);
  assert.equal(plan.trips[0].startMs, base);
  assert.equal(plan.trips[0].endMs, base + 30 * MS);
  assert.equal(plan.trips[0].crossDay, true);
});

console.log(`REST_MIN=${REST_MIN}, MAX_DRIVING_MIN=${MAX_DRIVING_MIN}`);
console.log(`\nALL ${passed} CHECKS PASSED`);
