import "./env.mjs";
import { useScheduleStore } from "./out/store.js";
import { loadState } from "./out/storage.js";
const store = useScheduleStore();
const today = new Date().toISOString().slice(0,10);
store.schedule("o6","D1",`${today}T09:30`,60);
const restored = loadState();
console.log("live assignments:", store.assignments.length, "restored:", restored.assignments.length);
const live = store.assignments.find(a=>a.orderId==="o6");
const r = restored.assignments.find(a=>a.orderId==="o6");
console.log("live status:", live.status, "restored status:", r?.status);
console.log("keys mem:", [...memKeys()]);
function memKeys(){ return []; }
