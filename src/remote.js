// Public InvocationDescriptor contract, independently authored. Session access
// uses DSH's registered `sessionId` resource reader on every endpoint.
export const PACKAGE = '@learning-ai/dsh-input-suggestions';
export const NAMESPACE = 'inputSuggestions';
const codec = (typeSymbol, parse) => ({ mode: 'strict', typeSymbol, create: () => ({ parse }) });
const output = codec('unknown', value => value);
const codecs = {
  sessionId: codec('string', validSession),
  reading: codec('unknown', validReading),
  candidateId: codec('string | null', value => value == null ? null : validSession(value)),
};
export const remote = { package: PACKAGE, descriptors: [
  ['watch', ['sessionId', 'reading'], true],
  ['readGhost', ['sessionId', 'reading', 'candidateId']],
  ['accepted', ['sessionId', 'reading', 'candidateId']],
].map(([method, names, stream]) => ({
  id: `${NAMESPACE}/${method}`, namespace: NAMESPACE, service: NAMESPACE, method,
  invocation: { kind: 'direct' },
  parameters: names.map(name => ({ name, wire: name, source: 'json', codec: codecs[name] })),
  result: output,
  ...(stream ? { mode: 'stream', cancellation: { parameter: 'signal' } } : {}),
})) };

export function validSession(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new Error('invalid_session');
  return value;
}
export function validReading(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['text','source','revision'].includes(k))
    || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 6000
    || typeof value.source !== 'string' || value.source.length > 500
    || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('invalid_reading_context');
  return { text: value.text, source: value.source, revision: value.revision };
}
