<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Assignment, DeliveryOrder } from "../types";
import { drivers } from "../data/drivers";
import { MAX_DRIVING_MIN } from "../scheduler";
import { finishOf, humanMinutes, toInput } from "../utils/time";const props = defineProps<{
  visible: boolean;
  mode: "create" | "reassign";
  order: DeliveryOrder | null;
  existing?: Assignment | null;
  errors?: string[];
  suggestedStartMs?: number | null;
}>();

const emit = defineEmits<{
  "update:visible": [value: boolean];
  submit: [payload: { driverId: string; start: string; durationMin: number; reason: string }];
}>();

const driverId = ref(drivers[0].id);
const start = ref(toInput(defaultStart()));
const durationMin = ref(90);
const reason = ref("");

function defaultStart(): number {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d.getTime();
}

watch(
  () => props.visible,
  (open) => {
    if (open && props.order) {
      if (props.mode === "reassign" && props.existing) {
        driverId.value = props.existing.driverId;
        start.value = props.existing.start;
        durationMin.value = props.existing.durationMin;
      } else {
        const a = props.existing;
        driverId.value = a?.driverId ?? drivers[0].id;
        start.value = a?.start ?? toInput(defaultStart());
        durationMin.value = a?.durationMin ?? 90;
      }
      reason.value = "";
    }
  }
);

function applySuggestion() {
  if (typeof props.suggestedStartMs === "number" && Number.isFinite(props.suggestedStartMs)) {
    start.value = toInput(props.suggestedStartMs);
  }
}

const finish = computed(() => finishOf(start.value, Number(durationMin.value) || 0));

function close() {
  emit("update:visible", false);
}

function confirm() {
  emit("submit", {
    driverId: driverId.value,
    start: start.value,
    durationMin: Number(durationMin.value),
    reason: reason.value.trim()
  });
}
</script>

<template>
  <div v-if="visible && order" class="modal-mask" @click.self="close">
    <div class="modal">
      <header class="modal-head">
        <h3>{{ mode === "reassign" ? "改派司机 / 调整时段" : "派单排程" }}</h3>
        <button type="button" class="icon-btn" @click="close">×</button>
      </header>

      <div class="modal-body">
        <p class="modal-order">
          <strong>{{ order.code }}</strong>
          <span>{{ order.station }} · {{ order.fuel }} · {{ order.tons }}吨</span>
        </p>

        <label class="field">
          当班司机
          <select v-model="driverId">
            <option v-for="d in drivers" :key="d.id" :value="d.id">
              {{ d.id }} {{ d.name }}（{{ d.truck }} · {{ d.shift === "day" ? "白班" : "夜班" }}）
            </option>
          </select>
        </label>

        <div class="field-row">
          <label class="field">
            发车时间
            <input v-model="start" type="datetime-local" />
          </label>
          <label class="field">
            预计用时（分钟，上限{{ MAX_DRIVING_MIN }}）
            <input v-model.number="durationMin" type="number" min="1" :max="MAX_DRIVING_MIN" step="5" />
          </label>
        </div>

        <p class="finish-hint">
          预计完成：<strong>{{ finish.replace("T", " ") }}</strong>
          <span>用时 {{ humanMinutes(Number(durationMin) || 0) }}</span>
        </p>

        <label v-if="mode === 'reassign'" class="field">
          改派原因 <em>（将随旧完成时间一并留痕，并释放原时段）</em>
          <textarea v-model="reason" placeholder="如：车辆保养 / 司机交班 / 油站催单调整" />
        </label>

        <div v-if="errors && errors.length" class="error-list">
          <p>未通过排程：</p>
          <ul>
            <li v-for="(e, i) in errors" :key="i">⚠ {{ e }}</li>
          </ul>
          <button v-if="suggestedStartMs" type="button" class="secondary inline-btn" @click="applySuggestion">
            一键填入最早可用时间
          </button>
        </div>
      </div>

      <footer class="modal-foot">
        <button type="button" class="secondary" @click="close">取消</button>
        <button type="button" @click="confirm">
          {{ mode === "reassign" ? "确认改派" : "提交排程" }}
        </button>
      </footer>
    </div>
  </div>
</template>
