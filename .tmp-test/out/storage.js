// src/utils/time.ts
function toMs(local) {
  return new Date(local).getTime();
}
function toInput(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dayStartMs(date) {
  return (/* @__PURE__ */ new Date(`${date}T00:00`)).getTime();
}
function todayStr() {
  const d = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function clock(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dateOf(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function finishOf(startLocal, durationMin) {
  return toInput(toMs(startLocal) + durationMin * 6e4);
}
function humanMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}\u5206\u949F`;
  if (m === 0) return `${h}\u5C0F\u65F6`;
  return `${h}\u5C0F\u65F6${m}\u5206`;
}

// src/data/seed.ts
function buildSeed() {
  const today = todayStr();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const orders = [
    { id: "o1", code: `PD-${today.replace(/-/g, "")}-001`, station: "\u57CE\u4E1C\u7AD9", fuel: "92\u53F7\u6C7D\u6CB9", tons: 18, arriveAt: today, notes: "\u65E9\u9AD8\u5CF0\u524D\u8865\u5E93", createdAt: now },
    { id: "o2", code: `PD-${today.replace(/-/g, "")}-002`, station: "\u673A\u573A\u7AD9", fuel: "\u67F4\u6CB9", tons: 12, arriveAt: today, notes: "\u52A0\u6CE8\u822A\u6CB9\u8F66\u8F86", createdAt: now },
    { id: "o3", code: `PD-${today.replace(/-/g, "")}-003`, station: "\u65B0\u533A\u7AD9", fuel: "95\u53F7\u6C7D\u6CB9", tons: 10, arriveAt: today, notes: "\u539F\u6D3E\u738B\u5EFA\u56FD\uFF0C\u8F66\u8F86\u4FDD\u517B\u6539\u6D3E", createdAt: now },
    { id: "o4", code: `PD-${today.replace(/-/g, "")}-004`, station: "\u673A\u573A\u7AD9", fuel: "92\u53F7\u6C7D\u6CB9", tons: 16, arriveAt: today, notes: "\u591C\u95F4\u822A\u73ED\u8865\u73ED", createdAt: now },
    { id: "o5", code: `PD-${today.replace(/-/g, "")}-005`, station: "\u65B0\u533A\u7AD9", fuel: "\u67F4\u6CB9", tons: 20, arriveAt: today, notes: "\u5DE5\u5730\u96C6\u4E2D\u52A0\u6CE8", createdAt: now },
    { id: "o6", code: `PD-${today.replace(/-/g, "")}-006`, station: "\u57CE\u4E1C\u7AD9", fuel: "95\u53F7\u6C7D\u6CB9", tons: 8, arriveAt: today, notes: "\u7EB8\u9762\u987A\u5E8F\u7B2C 6 \u5355", createdAt: now },
    { id: "o7", code: `PD-${today.replace(/-/g, "")}-007`, station: "\u673A\u573A\u7AD9", fuel: "\u67F4\u6CB9", tons: 14, arriveAt: today, notes: "\u7B49\u8C03\u5EA6\u5B89\u6392", createdAt: now }
  ];
  const assignments = [
    // D1 王建国：120 + 90 分钟，间隔 15 分，再接单即累计 240 分边界附近
    {
      id: "a1",
      orderId: "o1",
      driverId: "D1",
      start: `${today}T07:00`,
      durationMin: 120,
      status: "arrived",
      history: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "a2",
      orderId: "o2",
      driverId: "D1",
      start: `${today}T09:15`,
      durationMin: 90,
      status: "enroute",
      history: [],
      createdAt: now,
      updatedAt: now
    },
    // o3：从 D1 改派给 D2，留有原因与旧完成时间
    {
      id: "a3",
      orderId: "o3",
      driverId: "D2",
      start: `${today}T10:30`,
      durationMin: 75,
      status: "scheduled",
      history: [
        {
          at: now,
          reason: "\u738B\u5EFA\u56FD\u8F66\u8F86\u8C6BA\xB77K21\u4FDD\u517B\uFF0C\u6539\u7531\u674E\u6D77\u5CF0\u627F\u8FD0",
          oldDriverId: "D1",
          oldStart: `${today}T10:00`,
          oldDurationMin: 75,
          oldFinish: `${today}T11:15`
        }
      ],
      createdAt: now,
      updatedAt: now
    },
    // D3 夜班里有一条任务
    {
      id: "a4",
      orderId: "o4",
      driverId: "D3",
      start: `${today}T20:00`,
      durationMin: 100,
      status: "scheduled",
      history: [],
      createdAt: now,
      updatedAt: now
    },
    // o5：派给 D1 的 11:30，与 a2（09:15–10:45）不撞时，但再接单累计
    // 120+15+90+45（gap）+95 -> 插入休息后休息 10:45–11:15 与 11:30 不冲突，
    // 这里演示“未通过排程”：派 11:00 发车会撞上强制休息
    {
      id: "a5",
      orderId: "o5",
      driverId: "D1",
      start: `${today}T11:00`,
      durationMin: 95,
      status: "rejected",
      rejectReason: "\u672A\u901A\u8FC7\u6392\u7A0B\uFF1A10:45 \u8D77\u9700\u5F3A\u5236\u4F11\u606F 30 \u5206\u949F\uFF0C11:00 \u53D1\u8F66\u4E0E\u4F11\u606F\u65F6\u6BB5\u51B2\u7A81\uFF1B\u540C\u65F6\u7D2F\u8BA1\u9A7E\u9A76\u5C06\u8FBE 4 \u5C0F\u65F6",
      history: [],
      createdAt: now,
      updatedAt: now
    }
  ];
  return { orders, assignments, seq: 7, version: 1 };
}

// src/storage.ts
var STORAGE_KEY = "hxwlfront-19-driver-schedule-v1";
var DATA_VERSION = 1;
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return buildSeed();
  try {
    const parsed = JSON.parse(raw);
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
function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}
export {
  DATA_VERSION,
  clearState,
  loadState,
  saveState
};
