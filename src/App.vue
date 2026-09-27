<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useScheduleStore } from "./store";
import { drivers } from "./data/drivers";
import { dayStartMs, todayStr } from "./utils/time";
import ScheduleDialog from "./components/ScheduleDialog.vue";
import PendingPanel from "./components/PendingPanel.vue";
import DriverTimeline from "./components/DriverTimeline.vue";
import type { Assignment, DeliveryOrder } from "./types";

const store = useScheduleStore();

const date = ref(todayStr());

const STATIONS = ["城东站", "机场站", "新区站"];
const FUELS = ["92号汽油", "95号汽油", "柴油"];

const form = reactive({
  station: STATIONS[0],
  fuel: FUELS[0],
  tons: 15,
  arriveAt: todayStr(),
  notes: ""
});

/* ---------- 弹窗状态 ---------- */
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "reassign">("create");
const activeOrder = ref<DeliveryOrder | null>(null);
const dialogErrors = ref<string[]>([]);
const suggestedStartMs = ref<number | null>(null);

/* ---------- 派生数据 ---------- */
const dayPlans = computed(() =>
  drivers.map((d) => store.driverDayPlan(d.id, date.value))
);

const dayAssignments = computed(() => {
  // 当日开始的任务，加上前一天开始、跨过当日 00:00 的任务
  const dayMs = dayStartMs(date.value);
  const dayEndMs = dayMs + 24 * 3_600_000;
  return store.assignments
    .filter((a) => {
      const startMs = new Date(a.start).getTime();
      return (
        ["scheduled", "enroute", "arrived"].includes(a.status) &&
        startMs < dayEndMs &&
        startMs + a.durationMin * 60_000 > dayMs
      );
    })
    .sort((a, b) => a.start.localeCompare(b.start));
});

const assignmentById = computed(() => {
  const map = new Map<string, Assignment>();
  for (const a of store.assignments) map.set(a.id, a);
  return map;
});

const orderInfo = computed(() => {
  const map = new Map<string, { code: string; station: string; fuel: string; tons: number }>();
  for (const o of store.orders) map.set(o.id, { code: o.code, station: o.station, fuel: o.fuel, tons: o.tons });
  return map;
});

const totalRestsToday = computed(() => dayPlans.value.reduce((sum, p) => sum + p.rests.length, 0));

const metrics = computed(() => [
  { label: "当班司机", value: `${drivers.length} 人`, sub: "换班资料独立维护" },
  { label: "当日已排任务", value: `${dayAssignments.value.length} 单`, sub: "占用时段互不重叠" },
  { label: "强制休息", value: `${totalRestsToday.value} 段`, sub: "满4小时前休30分钟" },
  { label: "待安排单", value: `${store.pendingOrders.length} 单`, sub: "未通过排程留在此处" }
]);

/* ---------- 操作 ---------- */

function submitOrder() {
  store.addOrder({ ...form });
  form.notes = "";
  flash("配送单已进入待安排区");
}

function openSchedule(order: DeliveryOrder, mode: "create" | "reassign" = "create") {
  activeOrder.value = order;
  dialogMode.value = mode;
  dialogErrors.value = [];
  suggestedStartMs.value = null;
  dialogVisible.value = true;
}

function handleDialogSubmit(payload: {
  driverId: string;
  start: string;
  durationMin: number;
  reason: string;
}) {
  if (!activeOrder.value) return;
  const outcome =
    dialogMode.value === "reassign"
      ? store.reassign(activeOrder.value.id, payload.driverId, payload.start, payload.durationMin, payload.reason)
      : store.schedule(activeOrder.value.id, payload.driverId, payload.start, payload.durationMin);

  if (outcome.ok) {
    dialogVisible.value = false;
    flash(dialogMode.value === "reassign" ? "改派成功：原时段已释放并留痕" : "排程成功：时段已占用");
  } else {
    dialogErrors.value = outcome.errors;
    suggestedStartMs.value = outcome.suggestedStartMs ?? null;
  }
}

function reassignExisting(a: Assignment) {
  const order = store.orderById(a.orderId);
  if (!order) return;
  openSchedule(order, "reassign");
}

function advance(a: Assignment) {
  store.advanceStatus(a);
  flash(a.status === "scheduled" ? "已记为运输中" : "已记为到站");
}

function release(a: Assignment) {
  const order = store.orderById(a.orderId);
  if (order && confirm(`释放 ${order.code} 在 ${a.start.replace("T", " ")} 的占用时段？该单将退回待安排区。`)) {
    store.releaseToPending(a.orderId);
    flash("时段已释放，单据退回待安排区");
  }
}

function removeOrder(orderId: string) {
  const order = store.orderById(orderId);
  if (order && confirm(`确定删除 ${order.code}？其排程与改派记录一并删除。`)) {
    store.removeOrder(orderId);
  }
}

function resetDemo() {
  if (confirm("恢复演示数据？当前所有排程与待安排单将被重置。")) {
    store.resetDemo();
  }
}

const toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function flash(msg: string) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2200);
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 司机当班排程</p>
          <h1>油品配送司机排程</h1>
          <p class="subtitle">
            换班后按当班司机实际可用时间派单：同一司机时段不重叠，连续驾驶满 4 小时前强制休息 30 分钟；
            改派释放原时段并留痕，未通过排程的单留在待安排区，数据本地保存、重开不丢。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Pinia</span>
          <span class="tag">TypeScript</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics">
        <article v-for="m in metrics" :key="m.label" class="metric">
          <span>{{ m.label }}</span>
          <strong>{{ m.value }}</strong>
          <em>{{ m.sub }}</em>
        </article>
      </section>

      <section class="toolbar">
        <label class="date-picker">
          排班日期
          <input v-model="date" type="date" />
        </label>
        <div class="legend">
          <span class="legend-item"><i class="legend-box trip" />驾驶任务</span>
          <span class="legend-item"><i class="legend-box rest" />强制休息</span>
          <span class="legend-item"><i class="legend-box enroute" />运输中</span>
          <span class="legend-item"><i class="legend-box arrived" />已到站</span>
        </div>
        <button type="button" class="secondary" @click="resetDemo">恢复演示数据</button>
      </section>

      <section class="workspace">
        <!-- 左：新建配送单 + 待安排区 -->
        <div class="left-col">
          <form class="panel" @submit.prevent="submitOrder">
            <h2>新建配送单</h2>
            <p class="panel-desc">单据先进入待安排区，由调度员选择司机与发车时间完成排程。</p>
            <div class="form-grid">
              <label>
                目标油站
                <select v-model="form.station" required>
                  <option v-for="s in STATIONS" :key="s" :value="s">{{ s }}</option>
                </select>
              </label>
              <label>
                油品
                <select v-model="form.fuel" required>
                  <option v-for="f in FUELS" :key="f" :value="f">{{ f }}</option>
                </select>
              </label>
              <label>
                配送吨数
                <input v-model.number="form.tons" type="number" min="1" required />
              </label>
              <label>
                计划到达
                <input v-model="form.arriveAt" type="date" required />
              </label>
              <label class="full">
                备注
                <textarea v-model="form.notes" placeholder="油站要求、装卸说明等" />
              </label>
              <button type="submit" class="full">保存到待安排区</button>
            </div>
          </form>

          <PendingPanel
            :orders="store.pendingOrders"
            :assignment-by-order="store.assignmentByOrder"
            @schedule="(o: DeliveryOrder) => openSchedule(o, 'create')"
            @remove="removeOrder"
          />
        </div>

        <!-- 右：当班时间轴 + 明细 -->
        <div class="right-col">
          <DriverTimeline
            :date="date"
            :plans="dayPlans"
            :assignments="dayAssignments"
            :assignment-by-id="assignmentById"
            :order-info="orderInfo"
            @reassign="reassignExisting"
            @advance="advance"
            @release="release"
          />
        </div>
      </section>
    </div>

    <ScheduleDialog
      v-model:visible="dialogVisible"
      :mode="dialogMode"
      :order="activeOrder"
      :existing="activeOrder ? store.assignmentByOrder.get(activeOrder.id) ?? null : null"
      :errors="dialogErrors"
      :suggested-start-ms="suggestedStartMs"
      @submit="handleDialogSubmit"
    />

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </main>
</template>
