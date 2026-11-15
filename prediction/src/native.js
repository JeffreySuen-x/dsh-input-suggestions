import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm';
import { policy } from './contract.js';
export const visibleText = message => (message?.content ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');
export function predictionProjection(derive) {
  const row = z.object({ seq: z.number(), role: z.string(), text: z.string(), truncated: z.boolean() });
  return { key: 'task_prediction_context', stateVersion: 1,
    stateSchema: z.object({ seq: z.number(), busy: z.boolean(), records: z.array(row) }),
    init: () => ({ seq: -1, busy: false, records: [] }),
    apply(state, event) {
      if (event.type === 'turn/start') return { ...state, seq: event.seq, busy: true };
      if (event.type === 'turn/end') return { ...state, seq: event.seq, busy: false };
      if (!['user/message', 'assistant/message', 'tool/result'].includes(event.type)) return state;
      const message = derive(event), text = visibleText(message);
      if (!text.trim() || message?.source?.kind === 'runtime-context') return state;
      const records = [...state.records, { seq: event.seq, role: message.role, text: text.slice(0, 4000), truncated: text.length > 4000 }].slice(-12);
      while (records.reduce((n, r) => n + r.text.length, 0) > 16000) records.shift();
      return { ...state, seq: event.seq, records };
    } };
}

// DSH owns routing, audit, usage and storage. No tools; one model step per prediction.
export function nativePredictor(ctx, config) {
  const jobs = new Map();
  const predict = async (frame, signal) => {
    const previous = jobs.get(frame.sessionId);
    let handle, answer = null, steps = 0, settlements = 0;
    const usage = { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, unknown: 0 };
    const run = async () => {
      if (previous) await previous.catch(() => {});
      signal.throwIfAborted();
      const id = `dsh-input-prediction-${frame.sessionId}`;
      const setup = scope => {
        scope.tools.restrict({ allow: [] }); scope.systemPrompt.suppressRuntimeContext();
        scope.systemPrompt.section({ name: 'input-prediction', order: 10210, text: policy, interpolate: false, complete: true });
        scope.on('agent/pre-step', async (_, next) => {
          const value = await next(); if (value.kind !== 'enter') return value;
          return steps++ === 0 ? { ...value, startsRequestSeries: true } : { kind: 'reject' };
        });
        scope.on('session/event', (session, event) => {
          if (session.id !== id || !['assistant/message','assistant/attempt'].includes(event.type)) return;
          settlements++;
          if (event.type === 'assistant/message') answer = visibleText(session.deriveEventMessage(event));
          const reported = event.data.usage ?? lastAssistantStreamChunk(event.data.stream, 'usage')?.usage;
          if (!reported || ![reported.inputTokens,reported.outputTokens,reported.cacheReadTokens ?? 0,reported.cacheWriteTokens ?? 0].every(n => Number.isSafeInteger(n) && n >= 0)) { usage.unknown++; return; }
          const input = reported.inputTokens + (reported.cacheReadTokens ?? 0) + (reported.cacheWriteTokens ?? 0);
          usage.input += input; usage.output += reported.outputTokens;
          usage.cacheRead += reported.cacheReadTokens ?? 0; usage.cacheWrite += reported.cacheWriteTokens ?? 0;
          usage.reasoning += reported.reasoningTokens ?? 0;
          // Cache buckets are disjoint; reasoning is a detail, not added again.
          usage.total += Number.isSafeInteger(reported.totalTokens) && reported.totalTokens >= input + reported.outputTokens ? reported.totalTokens : input + reported.outputTokens;
        });
      };
      let stored;
      try { stored = await ctx.sessionQuery.readSession(id); }
      catch (error) { if (error.code !== 'SESSION_QUERY_SESSION_NOT_FOUND') throw error; }
      signal.throwIfAborted();
      if (stored && stored.session.cwd !== frame.cwd) throw new Error('prediction_workspace_mismatch');
      const options = { setup, signal, agentOptions: { ...frame.model, maxTokens: config.outputTokens } };
      handle = stored ? await ctx.agents.resume({ ...options, resumeSessionId: id })
        : await ctx.agents.create({ ...options, sessionId: id, meta: { cwd: frame.cwd } });
      const agent = handle.agent, cancel = () => agent.cancel({ kind: 'user' });
      signal.addEventListener('abort', cancel, { once: true });
      try {
        signal.throwIfAborted(); agent.model.select(frame.model);
        await agent.runMaintenance(async () => {
          const nodes = agent.session.surface.nodes.slice(1);
          if (nodes.length) agent.session.append('user/message', { id: randomUUID(), role: 'user', source: { kind: 'input-prediction' },
            content: [{ type: 'text', text: 'Previous input predictions are superseded by the new frame.' }] },
          { surfaceOp: { op: 'replace', startSeq: nodes[0], endSeq: nodes.at(-1) }, sourceEventSeqs: nodes });
        });
        agent.followup({ id: randomUUID(), role: 'user', source: { kind: 'input-prediction', sessionId: frame.sessionId },
          content: [{ type: 'text', text: JSON.stringify(frame.input) }] });
        await agent.whenIdle(); signal.throwIfAborted(); await ctx.sessions.flush(agent.session);
        if (answer === null) throw new Error('prediction_no_answer');
        return { text: answer, usage };
      } finally { signal.removeEventListener('abort', cancel); }
    };
    const task = run().catch(error => { if (steps && !settlements) usage.unknown++; error.predictionUsage = usage; throw error; }).finally(async () => { await handle?.dispose(); if (jobs.get(frame.sessionId) === task) jobs.delete(frame.sessionId); });
    jobs.set(frame.sessionId, task); return task;
  };
  predict.close = () => Promise.allSettled([...jobs.values()]);
  return predict;
}
