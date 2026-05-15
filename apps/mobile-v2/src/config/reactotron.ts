// Only active in __DEV__ builds — zero cost in production
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Reactotron = require('reactotron-react-native').default;
  Reactotron
    .configure({ name: 'Custodia de Valores', port: 9091 })
    .useReactNative({
      // Auto-intercepts all XHR/fetch — shows full req+res in Reactotron Network tab
      networking: { ignoreUrls: /symbolicate|hot-update/ },
    })
    .connect();
}

/**
 * Structured log visible in Reactotron (console.log is patched by useReactNative).
 * In prod this is a no-op — the call is still there but __DEV__ is false at build time.
 */
export function tlog(tag: string, data?: unknown): void {
  if (__DEV__) {
    console.log(`[${tag}]`, data ?? '');
  }
}

export function tlogError(tag: string, error: unknown): void {
  if (__DEV__) {
    const msg = error instanceof Error
      ? `${error.message}${error.stack ? `\n${error.stack.split('\n')[1]}` : ''}`
      : JSON.stringify(error);
    console.log(`[ERROR:${tag}]`, msg);
  }
}
