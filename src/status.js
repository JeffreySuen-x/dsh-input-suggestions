// Shared vocabulary only; no provider errors, prompts or private context on the wire.
export const STATUS = Object.freeze({
  idle: ['idle', '等待新的对话或阅读选文'],
  connecting: ['idle', '正在连接预测服务'],
  waiting: ['idle', '等待主对话回答完成'],
  editing: ['idle', '你正在编辑，预测已让出输入框'],
  inactive: ['idle', '输入框暂不可用于预测'],
  dismissed: ['idle', '本轮建议已接纳或忽略，等待新的上下文'],
  queued: ['ongoing', '等待本轮上下文稳定'],
  preparing: ['ongoing', '正在整理上下文并检查预算'],
  generating: ['ongoing', '正在生成下一句建议'],
  checking: ['ongoing', '正在校验建议并保存任务记忆'],
  ready: ['done', '建议已就绪，可在输入框接纳'],
  empty: ['idle', '本轮预测完成，暂无合适建议'],
  budget: ['warning', '预测预算不足，本轮未发起模型请求'],
  oversized: ['warning', '材料过长或不完整，本轮未发起模型请求'],
  interrupted: ['warning', '本轮已停止，等待新的上下文，不会自动重复调用'],
  unavailable: ['error', '暂时无法读取预测上下文，主对话仍可继续'],
  error: ['error', '本轮预测失败，主对话仍可继续'],
  timeout: ['error', '本轮预测超时，已停止等待'],
  offline: ['error', '预测连接中断'],
});
export const validStatus = value => typeof value === 'string' && Object.hasOwn(STATUS, value);
export const emptyView = (status = 'idle') => ({ ghost: null, candidates: [], status });

// The composer publishes what is actually visible/eligible. Header subscribers
// never activate a model request and do not require the companion plugin.
export function createStatusFeed() {
  const entries = new Map();
  const get = id => {
    if (!entries.has(id)) entries.set(id, { values: new Map(), listeners: new Set(), status: 'inactive' });
    return entries.get(id);
  };
  const update = (id, e) => {
    const values = [...e.values.values()], current = values.filter(v => v.active).at(-1) ?? values.at(-1);
    const status = current?.status ?? 'inactive';
    if (e.status !== status) { e.status = status; for (const fn of e.listeners) fn(); }
    if (!e.values.size && !e.listeners.size) entries.delete(id);
  };
  return {
    snapshot: id => entries.get(id)?.status ?? 'inactive',
    subscribe(id, fn) { const e = get(id); e.listeners.add(fn); return () => { e.listeners.delete(fn); update(id, e); }; },
    publish(id, owner, status, active) {
      const e = get(id), value = { status, active }; e.values.set(owner, value); update(id, e);
      return () => { if (e.values.get(owner) === value) { e.values.delete(owner); update(id, e); } };
    },
  };
}
