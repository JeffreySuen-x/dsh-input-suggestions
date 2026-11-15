// Optional memory must never make preparation of the main answer fail. Checking
// availability does not need a projection, default-model lookup or a prediction.
export function memoryAvailable(domain, agent) {
  if (!agent) return false;
  try { return !!domain.table('tasks').get(agent.id); }
  catch { return false; }
}

export function memoryTool(service) {
  return { name: 'task_prediction_memory',
    description: 'Inspect the current conversation\'s derived input-prediction memory and token budget, or forget that summary only when the user explicitly requests it. Original DSH history and spent budget are preserved. User corrections belong in the normal conversation. Never operate on another session.',
    parameters: { action: { type: 'string', enum: ['inspect','forget'], required: true, description: 'inspect or forget' } },
    output: { schema: { type: 'string' }, render: (_, value) => [{ type: 'text', text: value }] },
    async execute({ action }, exec) {
      exec.signal.throwIfAborted();
      const id = exec.agent?.id, frame = id && service.frame(id);
      if (!frame || !['inspect','forget'].includes(action)) throw new Error('invalid_task_memory_action');
      if (action === 'forget') await service.forget(id);
      const task = service.store.task(id, frame.cwd);
      return JSON.stringify({ task: id, cursor: task.cursor, memory: task.memory, forgotten: action === 'forget',
        budget: service.store.budget(id), usageNote: 'Input includes cache buckets. Reasoning is only the sum reported by the provider, not a guarantee of no unreported reasoning. Estimated cost is not exact billing.', accepted: task.accepted, sent: task.sent,
        meanEditDistance: task.sent ? task.editDistance / task.sent : null,
        tokensPerAcceptedDraft: task.accepted ? service.store.budget(id).session.charged / task.accepted : null });
    } };
}
