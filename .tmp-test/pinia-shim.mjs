// 极简 defineStore：延迟执行 setup，用 Proxy 模拟 Pinia 对 ref/computed 的自动解包
import { isRef } from "vue";

export function defineStore(_id, setup) {
  return () => {
    const raw = setup();
    return new Proxy(raw, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        return isRef(value) ? value.value : value;
      }
    });
  };
}
