import { randomUUID } from 'node:crypto';
import { defineDomain } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import { noteSchema, candidateSchema } from './contract.js';
const n = z.number().finite().nonnegative();
const counters = z.object({ charged: n, estimated: n, input: n, output: n, cacheRead: n, cacheWrite: n, reasoning: n }).strict();
const zero = () => ({ charged: 0, estimated: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 });
const candidate = candidateSchema.extend({ id: z.string().min(1) });
const taskSchema = z.object({ cwd: z.string(), cursor: z.number().int().min(-1), epoch: n, memory: z.array(noteSchema).max(12),
  attemptedKey: z.string().nullable(), last: z.object({ key: z.string(), candidates: z.array(candidate).max(3) }).nullable(),
  acceptedIds: z.array(z.string()).max(64), accepted: n, sent: n, editDistance: n,
  pendingChoice: z.object({ id: z.string(), text: z.string(), throughSeq: z.number().int() }).nullable() }).strict();
const stateSchema = z.object({ days: z.record(z.string(), counters), sessions: z.record(z.string(), counters),
  pending: z.record(z.string(), z.object({ sessionId: z.string(), day: z.string(), amount: n }).strict()) }).strict();
export const predictionDomain = defineDomain({ name: 'dsh_task_prediction', version: 1, tables: { tasks: { valueSchema: taskSchema } },
  global: { initial: { days: {}, sessions: {}, pending: {} }, schema: stateSchema } });
export const emptyTask = cwd => ({ cwd, cursor: -1, epoch: 0, memory: [], attemptedKey: null, last: null, acceptedIds: [], accepted: 0, sent: 0, editDistance: 0, pendingChoice: null });

// DSH owns durable storage. This short queue serializes read-modify-write admission
// across sessions; no call can reserve against a stale daily balance.
export class PredictionStore {
  constructor(domain, config, now = () => new Date()) { Object.assign(this, { domain, config, now }); this.queue = Promise.resolve(); }
  transaction(fn) { const run = this.queue.then(fn); this.queue = run.catch(() => {}); return run; }
  async start() {
    // A process loss cannot prove that a provider did no work. Keep its reservation
    // charged as estimated; a restart must never refund it or repeat the same key.
    const state = this.domain.global.get();
    if (Object.keys(state.pending).length) await this.domain.global.set({ ...state, pending: {} });
  }
  task(id, cwd) {
    const task = this.domain.table('tasks').get(id);
    if (task && task.cwd !== cwd) throw new Error('prediction_workspace_mismatch');
    return task ?? emptyTask(cwd);
  }
  save(id, task) { return this.domain.table('tasks').put(id, taskSchema.parse(task)); }
  update(id, cwd, fn) { return this.transaction(async () => { const next = fn(this.task(id, cwd)); await this.save(id, next); return next; }); }
  reserve(sessionId, amount) {
    return this.transaction(async () => {
      const state = this.domain.global.get(), day = this.now().toISOString().slice(0, 10);
      const daily = state.days[day] ?? zero(), session = state.sessions[sessionId] ?? zero();
      if (daily.charged + amount > this.config.dailyTokens || session.charged + amount > this.config.sessionTokens) return null;
      const id = randomUUID(), add = c => ({ ...c, charged: c.charged + amount, estimated: c.estimated + amount });
      await this.domain.global.set({ days: { ...state.days, [day]: add(daily) }, sessions: { ...state.sessions, [sessionId]: add(session) },
        pending: { ...state.pending, [id]: { sessionId, day, amount } } });
      return id;
    });
  }
  settle(id, usage) {
    return this.transaction(async () => {
      const state = this.domain.global.get(), reservation = state.pending[id];
      if (!reservation) return; // Idempotent completion or a recovered reservation.
      const { sessionId, day, amount } = reservation;
      const unknown = usage?.unknown ?? 1, estimated = amount * unknown, charged = (usage?.total ?? 0) + estimated;
      const add = c => ({ charged: c.charged - amount + charged, estimated: c.estimated - amount + estimated,
        input: c.input + (usage?.input ?? 0), output: c.output + (usage?.output ?? 0), cacheRead: c.cacheRead + (usage?.cacheRead ?? 0),
        cacheWrite: c.cacheWrite + (usage?.cacheWrite ?? 0), reasoning: c.reasoning + (usage?.reasoning ?? 0) });
      const pending = { ...state.pending }; delete pending[id];
      await this.domain.global.set({ days: { ...state.days, [day]: add(state.days[day]) },
        sessions: { ...state.sessions, [sessionId]: add(state.sessions[sessionId]) }, pending });
    });
  }
  budget(id) { const state = this.domain.global.get(); return { session: state.sessions[id] ?? zero(), daily: state.days[this.now().toISOString().slice(0,10)] ?? zero(), limits: this.config }; }
  async close() { await this.queue; await this.domain.close(); }
}
