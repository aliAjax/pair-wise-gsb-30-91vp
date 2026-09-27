<script setup lang="ts">
import { computed } from "vue";
import type { Assignment, DriverDayPlan } from "../types";
import { drivers, getDriver, shiftLabel } from "../data/drivers";
import { MAX_DRIVING_MIN } from "../scheduler";
import { clock, dateOf, finishOf, humanMinutes } from "../utils/time";

const props = defineProps<{
  date: string;
  plans: DriverDayPlan[];
  assignments: Assignment[];
  /** 占用时段的 assignment，按 id 索引，便于查订单信息 */
  assignmentById: Map<string, Assignment>;
  orderInfo: Map<string, { code: string; station: string; fuel: string; tons: number }>;
}>();

const emit = defineEmits<{
  reassign: [assignment: Assignment];
  advance: [assignment: Assignment];
  release: [assignment: Assignment];
}>();

const hours = Array.from({ length: 25 }, (_, i) => i); // 0..24 小时刻度

function leftOf(ms: number, dayStartMs: number): string {
  return `${(((ms - dayStartMs) / 3_600_000) / 24) * 100}%`;
}
function widthOf(startMs: number, endMs: number): string {
  return `${Math.max(0.4, ((endMs - startMs) / 3_600_000 / 24) * 100)}%`;
}

function planOf(driverId: string): DriverDayPlan {
  return props.plans.find((p) => p.driverId === driverId)!;
}

/** 按完成先后排序的任务，供下方清单使用 */
const sortedAssignments = computed(() =>
  [...props.assignments].sort((a, b) => a.start.localeCompare(b.start))
);

function statusLabel(status: Assignment["status"]): string {
  return { scheduled: "已排程", enroute: "运输中", arrived: "已到站", rejected: "未通过" }[status];
}

function restGap(plan: DriverDayPlan): string {
  return plan.drivingMinutes >= MAX_DRIVING_MIN ? "已达 4 小时，后续须休息后再接单" : `距 4 小时上限还差 ${humanMinutes(MAX_DRIVING_MIN - plan.drivingMinutes)}`;
}

/** 完成时间文本：跨天则追加“次日”提示 */
function finishText(a: Assignment): string {
  const finish = finishOf(a.start, a.durationMin);
  const startDate = dateOf(new Date(a.start).getTime());
  const finishDate = dateOf(new Date(finish).getTime());
  return finish.replace("T", " ") + (startDate !== finishDate ? "（次日）" : "");
}
</script>

<template>
  <section class="panel timeline-panel">
    <div class="panel-head">
      <h2>司机当班排程 <em>（{{ date }}，任务块为占用时段，斜纹块为强制休息 30 分钟）</em></h2>
    </div>

    <div class="timeline">
      <div class="timeline-ruler">
        <span
          v-for="h in hours"
          :key="h"
          class="ruler-tick"
          :style="{ left: `${(h / 24) * 100}%` }"
        >{{ String(h).padStart(2, '0') }}</span>
      </div>

      <div v-for="driver in drivers" :key="driver.id" class="lane-row">
        <div class="lane-meta">
          <p class="driver-name">
            {{ driver.name }}
            <span class="shift-tag" :class="driver.shift">{{ shiftLabel(driver.shift) }}</span>
          </p>
          <p class="driver-sub">{{ driver.id }} · {{ driver.truck }}</p>
          <p class="driver-stat">
            当日驾驶 <strong>{{ humanMinutes(planOf(driver.id).drivingMinutes) }}</strong>
            <em>{{ restGap(planOf(driver.id)) }}</em>
          </p>
        </div>

        <div class="lane">
          <div
            v-for="h in hours.slice(1)"
            :key="`g-${h}`"
            class="grid-line"
            :style="{ left: `${(h / 24) * 100}%` }"
          />

          <!-- 强制休息（引擎推导，不落库） -->
          <div
            v-for="(rest, i) in planOf(driver.id).rests"
            :key="`r-${i}`"
            class="block rest-block"
            :style="{
              left: leftOf(rest.startMs, planOf(driver.id).dayStartMs),
              width: widthOf(rest.startMs, rest.endMs)
            }"
            :title="`强制休息 ${clock(rest.startMs)}–${clock(rest.endMs)}`"
          >
            <span class="block-label">休息 {{ clock(rest.startMs) }}–{{ clock(rest.endMs) }}</span>
          </div>

          <!-- 驾驶任务 -->
          <div
            v-for="trip in planOf(driver.id).trips"
            :key="trip.assignmentId"
            class="block trip-block"
            :class="assignmentById.get(trip.assignmentId)?.status"
            :style="{
              left: leftOf(trip.startMs, planOf(driver.id).dayStartMs),
              width: widthOf(trip.startMs, trip.endMs)
            }"
            :title="`${orderInfo.get(trip.orderId)?.code} ${clock(trip.startMs)}–${clock(trip.endMs)}${trip.crossDay ? '（跨天）' : ''}`"
          >
            <span class="block-label">
              {{ orderInfo.get(trip.orderId)?.code }}
              <em>{{ clock(trip.startMs)}}–{{ clock(trip.endMs) }}{{ trip.crossDay ? " ⇄" : "" }}</em>
            </span>
          </div>
        </div>
      </div>
    </div>

    <h3 class="table-title">当日发运单明细</h3>
    <div class="assignment-table">
      <div v-if="sortedAssignments.length === 0" class="empty">当日暂无已排程任务</div>
      <article v-for="a in sortedAssignments" :key="a.id" class="assignment-row">
        <div class="row-main">
          <p class="record-title">{{ orderInfo.get(a.orderId)?.code }}</p>
          <div class="details details-inline">
            <span>{{ getDriver(a.driverId)?.name }}（{{ a.driverId }}）</span>
            <span>{{ orderInfo.get(a.orderId)?.station }} · {{ orderInfo.get(a.orderId)?.fuel }}</span>
            <span>发车 {{ a.start.replace('T', ' ') }}</span>
            <span>用时 {{ humanMinutes(a.durationMin) }}</span>
            <span>完成 {{ finishText(a) }}</span>
          </div>
        </div>
        <div class="row-side">
          <span class="status" :class="`status-${a.status}`">{{ statusLabel(a.status) }}</span>
          <div class="actions actions-tight">
            <button v-if="a.status !== 'arrived'" type="button" class="secondary" @click="emit('advance', a)">
              {{ a.status === "scheduled" ? "发车" : "到站" }}
            </button>
            <button type="button" class="secondary" @click="emit('reassign', a)">改派</button>
            <button type="button" class="secondary danger-ghost" @click="emit('release', a)">释放时段</button>
          </div>
        </div>

        <div v-if="a.history.length" class="history-box">
          <p>改派记录（{{ a.history.length }}）：</p>
          <ul>
            <li v-for="(log, i) in a.history" :key="i">
              <time>{{ new Date(log.at).toLocaleString("zh-CN") }}</time>
              原派 {{ getDriver(log.oldDriverId)?.name }}
              {{ log.oldStart.replace('T', ' ') }} 发车，
              旧完成时间 <strong>{{ log.oldFinish.replace('T', ' ') }}</strong>
              —— 原因：{{ log.reason }}
            </li>
          </ul>
        </div>
      </article>
    </div>
  </section>
</template>
