// Shared Peek clients also run outside Next.js. Bound every upstream request.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init = {}) => nativeFetch(input, {
  ...init,
  signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
});
