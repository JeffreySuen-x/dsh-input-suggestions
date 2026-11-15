import * as prediction from './prediction/index.js';
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol';
import { SuggestionBridge } from './src/bridge.js';
import { remote, NAMESPACE } from './src/remote.js';
export const name = 'dsh-input-suggestions';
export const inject = ['typert'];
export function apply(ctx, config = {}) {
  ctx.plugin(prediction, config.prediction ?? {});
  const service = new SuggestionBridge(); service.typertRemote = bindTypertRemote(service, NAMESPACE);
  ctx.provide(NAMESPACE, service);
  ctx.effect(() => ctx.typert.register({ package: remote.package, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] }, invocations: remote.descriptors }));
  ctx.effect(() => () => service.close());
  ctx.inject(['inputSuggestionSource'], scope => { const off = service.attach(scope.inputSuggestionSource); scope.effect(() => off); });
}
