<script setup lang="ts">
import type { Assignment, DeliveryOrder } from "../types";
import { getDriver } from "../data/drivers";
import { finishOf, humanMinutes } from "../utils/time";

const props = defineProps<{
  orders: DeliveryOrder[];
  assignmentByOrder: Map<string, Assignment>;
}>();

const emit = defineEmits<{
  schedule: [order: DeliveryOrder];
  remove: [orderId: string];
}>();

function rejectedOf(order: DeliveryOrder): Assignment | undefined {
  const a = props.assignmentByOrder.get(order.id);
  return a?.status === "rejected" ? a : undefined;
}
</script>

<template>
  <section class="panel pending-panel">
    <div class="panel-head">
      <h2>待安排区 <em>（未排程或未通过排程的单）</em></h2>
      <span class="count-badge">{{ orders.length }}</span>
    </div>

    <div v-if="orders.length === 0" class="empty">待安排区已清空，所有配送单均已排程</div>

    <article v-for="order in orders" :key="order.id" class="pending-card">
      <div class="pending-top">
        <p class="record-title">{{ order.code }}</p>
        <span class="status status-pending">待安排</span>
      </div>
      <div class="details">
        <span>油站：{{ order.station }}</span>
        <span>油品：{{ order.fuel }}</span>
        <span>吨数：{{ order.tons }} 吨</span>
        <span>计划到达：{{ order.arriveAt }}</span>
      </div>

      <div v-if="rejectedOf(order)" class="reject-box">
        <p>上次尝试未通过排程：</p>
        <ul>
          <li v-for="(line, i) in rejectedOf(order)!.rejectReason?.split('；').filter(Boolean)" :key="i">
            ⚠ {{ line }}
          </li>
        </ul>
        <p class="retry-params">
          尝试：{{ getDriver(rejectedOf(order)!.driverId)?.name }}
          · {{ rejectedOf(order)!.start.replace('T', ' ') }} 发车
          · {{ humanMinutes(rejectedOf(order)!.durationMin) }}
          · 预计完成 {{ finishOf(rejectedOf(order)!.start, rejectedOf(order)!.durationMin).replace('T', ' ') }}
        </p>
      </div>

      <p v-if="order.notes" class="note">{{ order.notes }}</p>

      <div class="actions">
        <button type="button" @click="emit('schedule', order)">排单 / 重新提交</button>
        <button type="button" class="secondary danger-ghost" @click="emit('remove', order.id)">删除</button>
      </div>
    </article>
  </section>
</template>
