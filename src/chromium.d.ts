// Chromium supports explicit output routing; TypeScript's DOM library omits it.
interface AudioContext {
  readonly sinkId: string | { type: 'none' };
  setSinkId(sinkId: string): Promise<void>;
}
