import { hash, prepare, decode, candidateSchema, limits } from './contract.js';
import { emptyView as empty } from '../../src/status.js';
const choices = (key, items) => items.map((c, i) => ({ ...candidateSchema.parse(c), id: hash([key, i, c]) }));
export class PredictionService {
  constructor({ frame, predict, store, config }) {
    Object.assign(this, { frame, predict, store, config: limits(config) });
    this.protocol = 2; this.entries = new Map(); this.jobs = new Map(); this.active = new Map(); this.context = null; this.closed = false;
  }
  attach(context) {
    if (this.context) throw new Error('prediction_context_already_attached');
    this.context = context; const off = context.onChange(() => this.changed()); this.changed();
    return () => { if (this.context !== context) return; this.context = null; off(); this.changed(); };
  }
  describe(sessionId, reading) {
    const frame = this.frame(sessionId);
    if (!frame || frame.busy || (!frame.records.length && !reading)) return null;
    let companion = null;
    try { companion = this.context?.read(sessionId) ?? null; } catch { /* Optional context cannot disable base prediction. */ }
    return { ...frame, reading, companion };
  }
  entry(sessionId, reading) {
    const key = hash([sessionId, reading]);
    if (!this.entries.has(key)) {
      for (const [id, e] of this.entries) if (!e.listeners.size && this.entries.size >= 32) this.entries.delete(id);
      this.entries.set(key, { sessionId, reading, listeners: new Set(), generation: 0, requestKey: undefined, view: empty() });
    }
    return this.entries.get(key);
  }
  publish(e) { for (const fn of e.listeners) fn(); }
  stop(e) { e.generation++; clearTimeout(e.timer); e.timer = null; e.controller?.abort();
    if (['queued','preparing','generating','checking'].includes(e.view.status)) e.view = empty('interrupted');
  }
  status(e, status) { e.view = empty(status); this.publish(e); }
  valid(e, generation, key) { return !this.closed && e.generation === generation && key === hash(this.describe(e.sessionId, e.reading)); }
  refresh(e) {
    if (this.closed) return;
    let frame, task;
    try {
      frame = this.describe(e.sessionId, e.reading);
      task = frame && this.store.task(frame.sessionId, frame.cwd);
    } catch {
      // A projection/storage outage belongs to this optional observer. Revoke
      // stale choices, keep the subscription, and recover on the next event.
      this.stop(e); e.requestKey = undefined; this.status(e, 'unavailable'); return;
    }
    const key = frame && hash(frame);
    if (key === e.requestKey) return;
    this.stop(e); e.requestKey = key; e.view = empty(); this.publish(e);
    if (!frame || !e.listeners.size) return;
    if (task.last?.key === key) { this.show(e, task.last.candidates); return; }
    if (task.attemptedKey === key) { this.status(e, 'interrupted'); return; } // No automatic retry.
    const reused = !e.reading && [frame.companion?.forecast && { text: frame.companion.forecast, kind: 'prediction' },
      frame.companion?.advice && { text: frame.companion.advice, kind: 'advisor' }]
      .map(candidate => candidateSchema.safeParse(candidate)).filter(result => result.success).map(result => result.data);
    if (reused?.length) {
      this.show(e, choices(key, reused));
      return;
    }
    const generation = e.generation;
    this.status(e, 'queued');
    e.timer = setTimeout(() => {
      e.timer = null;
      const previous = this.jobs.get(e.sessionId), old = this.active.get(e.sessionId);
      old?.abort(); const controller = e.controller = new AbortController(); this.active.set(e.sessionId, controller);
      const report = status => { if (!this.closed && e.generation === generation && e.requestKey === key) this.status(e, status); };
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort();
        report('timeout');
      }, this.config.timeoutMs);
      const run = (async () => {
        if (previous) await previous.catch(() => {});
        controller.signal.throwIfAborted();
        if (!this.valid(e, generation, key)) return;
        report('preparing');
        const current = this.store.task(frame.sessionId, frame.cwd), input = prepare(frame, current, this.config);
        if (!input) { report('oversized'); return; }
        await this.store.update(frame.sessionId, frame.cwd, t => ({ ...t, attemptedKey: key }));
        const reservation = await this.store.reserve(frame.sessionId, input.estimatedInput + this.config.outputTokens);
        if (!reservation) { report('budget'); return; }
        let usage = { total: 0, unknown: 0 }, candidates;
        try {
          controller.signal.throwIfAborted();
          report('generating');
          usage = undefined; // From dispatch onward, missing usage is conservatively estimated.
          const result = await this.predict({ ...frame, input }, controller.signal); usage = result.usage;
          controller.signal.throwIfAborted();
          if (!this.valid(e, generation, key)) return;
          report('checking');
          const decoded = decode(result.text, input, this.config);
          if (!this.valid(e, generation, key)) return;
          candidates = choices(key, decoded.candidates);
          await this.store.update(frame.sessionId, frame.cwd, t => controller.signal.aborted || !this.valid(e, generation, key) ? t
            : { ...t, cursor: decoded.memoryAccepted ? frame.seq : t.cursor, memory: decoded.memory,
              epoch: t.epoch + Number(decoded.taskChanged), last: { key, candidates } });
        } catch (error) { usage ??= error.predictionUsage; throw error; }
        finally { await this.store.settle(reservation, usage); }
        if (candidates && !controller.signal.aborted && this.valid(e, generation, key)) this.show(e, candidates);
      })().catch(() => {
        report(timedOut ? 'timeout' : controller.signal.aborted ? 'interrupted' : 'error');
      })
        .finally(() => { clearTimeout(timeout); if (e.controller === controller) e.controller = null;
          if (this.jobs.get(e.sessionId) === run) this.jobs.delete(e.sessionId);
          if (this.active.get(e.sessionId) === controller) this.active.delete(e.sessionId); });
      this.jobs.set(e.sessionId, run);
    }, this.config.debounceMs);
  }
  show(e, candidates) { e.view = { ghost: candidates[0] ?? null, candidates, status: candidates.length ? 'ready' : 'empty' }; this.publish(e); }
  changed(sessionId) { for (const e of this.entries.values()) if (e.listeners.size && (!sessionId || sessionId === e.sessionId)) this.refresh(e); }
  read(sessionId, reading = null) {
    const e = this.entries.get(hash([sessionId, reading]));
    try { return e && e.requestKey === hash(this.describe(sessionId, reading)) ? e.view : empty(); }
    catch { return empty('unavailable'); }
  }
  async *watch(sessionId, reading = null, signal) {
    if (this.closed) return;
    const e = this.entry(sessionId, reading); let wake, dirty = true, previous;
    const notify = () => { dirty = true; wake?.(); };
    e.listeners.add(notify); signal.addEventListener('abort', notify, { once: true }); this.refresh(e);
    try {
      while (!signal.aborted && !this.closed) {
        if (!dirty) await new Promise(resolve => { wake = resolve; });
        wake = undefined; if (signal.aborted || this.closed) break; dirty = false;
        const view = this.read(sessionId, reading), encoded = JSON.stringify(view);
        if (encoded !== previous) { previous = encoded; yield view; }
      }
    } finally { e.listeners.delete(notify); signal.removeEventListener('abort', notify);
      if (!e.listeners.size && (e.controller || e.timer)) { this.stop(e); if (!e.view.ghost) e.requestKey = undefined; } }
  }
  async accepted(sessionId, reading, id) {
    const candidate = this.read(sessionId, reading).candidates.find(c => c.id === id), frame = this.frame(sessionId);
    if (!candidate || !frame) return;
    await this.store.update(sessionId, frame.cwd, task => task.acceptedIds.includes(id) ? task : { ...task,
      accepted: task.accepted + 1, acceptedIds: [...task.acceptedIds,id].slice(-64), pendingChoice: { id, text: candidate.text, throughSeq: frame.seq } });
  }
  async sent(sessionId, message) {
    const frame = this.frame(sessionId); if (!frame) return;
    const task = this.store.task(sessionId, frame.cwd); if (!task.pendingChoice) return;
    const text = (message?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    await this.store.update(sessionId, frame.cwd, t => {
      if (!t.pendingChoice || frame.seq <= t.pendingChoice.throughSeq) return t;
      const chosen = t.pendingChoice.text, tail = text.trim().split('\n').at(-1).slice(-160);
      return { ...t, sent: t.sent + 1, editDistance: t.editDistance + (text.includes(chosen) ? 0 : distance(chosen, tail)), pendingChoice: null };
    });
  }
  async forget(sessionId) {
    const frame = this.frame(sessionId); if (!frame) return;
    for (const e of this.entries.values()) if (e.sessionId === sessionId) { this.stop(e); e.requestKey = undefined; e.view = empty(); this.publish(e); }
    await this.jobs.get(sessionId);
    await this.store.update(sessionId, frame.cwd, t => ({ ...t, memory: [], cursor: frame.seq, epoch: t.epoch + 1, attemptedKey: null, last: null, pendingChoice: null }));
    // Does not refund usage or generate a new request. The next stable context drives work.
  }
  async close() { this.closed = true; for (const e of this.entries.values()) { this.stop(e); this.publish(e); }
    await Promise.allSettled([...this.jobs.values()]); this.entries.clear(); }
}
function distance(a, b) { let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1])); row = next; } return row[b.length]; }
