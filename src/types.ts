/** 排程领域类型定义 */

/** 司机（换班后的当班司机，资料层独立维护） */
export interface Driver {
  id: string;
  name: string;
  /** 车牌号 */
  truck: string;
  /** 班次：白班 / 夜班 */
  shift: "day" | "night";
  /** 当班日期，格式 YYYY-MM-DD */
  dutyDate: string;
}

/** 改派留痕：释放原时段时记录原因与旧完成时间 */
export interface ReassignLog {
  at: string;
  reason: string;
  oldDriverId: string;
  oldStart: string;
  oldDurationMin: number;
  /** 旧完成时间（原发车时间 + 预计用时） */
  oldFinish: string;
}

/** 配送单 */
export interface DeliveryOrder {
  id: string;
  /** 单号，如 PD-20260927-001 */
  code: string;
  station: string;
  fuel: string;
  tons: number;
  /** 计划送达，YYYY-MM-DD */
  arriveAt: string;
  notes: string;
  createdAt: string;
}

/** 排程记录：一条配送单在某一时段被派给某司机；同一订单最多一条有效排程 */
export interface Assignment {
  id: string;
  orderId: string;
  driverId: string;
  /** 发车时间，datetime-local 字符串 YYYY-MM-DDTHH:mm */
  start: string;
  /** 预计用时（分钟） */
  durationMin: number;
  /** scheduled=占用时段；rejected=排程未通过的最近一次尝试，不占时段，单留待安排区 */
  status: "scheduled" | "enroute" | "arrived" | "rejected";
  /** 最近一次未通过校验的原因（处于待安排区时存在） */
  rejectReason?: string;
  /** 改派历史（按时间正序） */
  history: ReassignLog[];
  createdAt: string;
  updatedAt: string;
}

/** localStorage 中保存的整体数据 */
export interface PersistedState {
  orders: DeliveryOrder[];
  assignments: Assignment[];
  /** 单号自增序列 */
  seq: number;
  version: number;
}

/** 时间轴上的一个连续区间（毫秒时间戳） */
export interface Segment {
  startMs: number;
  endMs: number;
}

/** 司机某日时间轴（休息为推导产物，不落库） */
export interface DriverDayPlan {
  driverId: string;
  dayStartMs: number;
  /** 当日驾驶任务（已裁剪到当日窗口） */
  trips: Array<Segment & { orderId: string; assignmentId: string; crossDay: boolean }>;
  /** 因连续驾驶接近 4 小时而必须安排的 30 分钟休息 */
  rests: Segment[];
  /** 当日全部已排驾驶分钟数（按裁剪后计） */
  drivingMinutes: number;
}
