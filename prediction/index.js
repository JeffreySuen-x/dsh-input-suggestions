import { deriveEventMessage } from '@deepseek-ai/dsh-session';
import { PredictionService } from './src/prediction.js';
import { nativePredictor, predictionProjection } from './src/native.js';
import { PredictionStore, predictionDomain } from './src/store.js';
import { limits } from './src/contract.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { memoryTool, memoryAvailable } from './src/memory-tool.js';
export const name = 'dsh-task-prediction';
export const inject = ['sessions','sessionQuery','sessionProjections','agents','agentDefaultModel','tools','systemPrompt','storageDomain'];
export async function apply(ctx, config = {}) {
  const settings = limits(config), domain = await ctx.storageDomain.open(predictionDomain);
  let projection, service, predict;
  const store = new PredictionStore(domain, settings);
  try {
    await store.start(); projection = await ctx.sessionProjections.register(predictionProjection(deriveEventMessage));
    predict = nativePredictor(ctx, settings);
    service = new PredictionService({ store, config: settings, predict, frame(sessionId) {
      const session = ctx.sessions.get(sessionId);
      if (!session?.header.cwd || /^(dsh-input-prediction-|chishui-companion-)/.test(sessionId)) return null;
      return { sessionId, cwd: session.header.cwd, model: ctx.agentDefaultModel.currentSelection(), ...projection.stateOf(session) };
    } });
  } catch (error) { await projection?.dispose(); await store.close(); throw error; }
  ctx.provide('inputSuggestionSource', service);
  ctx.tools.register(defineTool(memoryTool(service)), { when: ({ agent, signal }) => !signal.aborted && memoryAvailable(domain, agent) });
  ctx.effect(() => async () => { await service.close(); await predict.close(); await projection.dispose(); await store.close(); });
  ctx.inject(['inputPredictionContext'], scope => { const off = service.attach(scope.inputPredictionContext); scope.effect(() => off); });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message') void service.sent(session.id, deriveEventMessage(event)).catch(error => ctx.logger.warn(error));
    service.changed(session.id);
  });
}
