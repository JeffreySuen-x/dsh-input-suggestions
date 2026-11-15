import { emptyView as empty, validStatus } from './status.js';
export function normalize(value) {
  if (!value) return empty();
  const items = value.candidates ?? (value.id ? [value] : value.ghost ? [value.ghost] : []);
  if (!Array.isArray(items) || items.length > 3) throw new Error('invalid_suggestion_source');
  const seen = new Set(), candidates = items.map(c => {
    if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 256 || seen.has(c.id) || typeof c.text !== 'string'
      || !c.text.trim() || c.text.length > 160 || /[\u0000-\u001f\u007f]/.test(c.text) || (c.kind && !['prediction','advisor'].includes(c.kind))) throw new Error('invalid_suggestion_source');
    seen.add(c.id); return { id: c.id, text: c.text, kind: c.kind ?? 'prediction' };
  });
  return { candidates, ghost: candidates[0] ?? null, status: candidates.length ? 'ready' : validStatus(value.status) && value.status !== 'ready' ? value.status : 'idle' };
}
// Display transport only. One optional source, no history, model or storage.
export class SuggestionBridge {
  constructor() { this.source = null; this.listeners = new Set(); this.closed = false; }
  attach(source) {
    if (this.source) throw new Error('input_suggestion_source_already_attached');
    this.source = source;
    const off = source.protocol === 2 ? () => {} : source.onChange(() => this.changed());
    this.changed();
    return () => { if (this.source !== source) return; this.source = null; off(); this.changed(); };
  }
  changed() { for (const fn of this.listeners) fn(); }
  async readGhost(sessionId, reading = null, candidateId = null) {
    const source = this.source;
    if (!source || (reading && source.protocol !== 2)) return null;
    const value = await (source.protocol === 2 ? source.read(sessionId, reading) : source.read(sessionId));
    if (source !== this.source) return null;
    const view = normalize(value);
    return candidateId ? view.candidates.find(c => c.id === candidateId) ?? null : view.ghost;
  }
  async accepted(sessionId, reading, candidateId) { await this.source?.accepted?.(sessionId, reading, candidateId); }
  async *watch(sessionId, reading = null, signal) {
    let controller, generation = 0, view = empty(), wake, dirty = true, previous;
    const notify = () => { dirty = true; wake?.(); };
    const restart = () => {
      controller?.abort(); controller = new AbortController(); const active = controller, version = ++generation, source = this.source;
      view = empty(source ? 'connecting' : 'unavailable'); notify(); if (!source || (reading && source.protocol !== 2)) return;
      (async () => {
        if (source.protocol === 2) {
          for await (const value of source.watch(sessionId, reading, active.signal)) {
            if (signal.aborted || active.signal.aborted || version !== generation) return;
            view = normalize(value); notify();
          }
        } else {
          const value = await source.read(sessionId, active.signal);
          if (!signal.aborted && !active.signal.aborted && version === generation) { view = normalize(value); notify(); }
        }
      })().catch(() => { if (version === generation) { view = empty('error'); notify(); } });
    };
    this.listeners.add(restart); signal.addEventListener('abort', notify, { once: true }); restart();
    try {
      while (!signal.aborted && !this.closed) {
        if (!dirty) await new Promise(resolve => { wake = resolve; });
        wake = undefined; if (signal.aborted || this.closed) break; dirty = false;
        const encoded = JSON.stringify(view);
        if (encoded !== previous) { previous = encoded; yield view; }
      }
    } finally { generation++; controller?.abort(); this.listeners.delete(restart); signal.removeEventListener('abort', notify); }
  }
  close() { this.closed = true; this.source = null; this.changed(); }
}
