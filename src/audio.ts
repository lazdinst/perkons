import type { Clip } from './storage';
export class AudioEngine {
  context = new AudioContext({ latencyHint: 'interactive' });
  clips = this.context.createGain();
  mic = this.context.createGain();
  master = this.context.createGain();
  analyser = this.context.createAnalyser();
  private monitorBus = this.context.createGain();
  private monitorStream = this.context.createMediaStreamDestination();
  private monitor = new Audio();
  private stream?: MediaStream;
  private micNode?: MediaStreamAudioSourceNode;
  private buffers = new Map<string, AudioBuffer>();
  private generation = 0;
  private playing = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  onChange = (_ids: string[]) => {};
  ready = false;
  constructor() {
    this.clips.connect(this.master); this.mic.connect(this.master);
    this.master.connect(this.analyser); this.analyser.connect(this.context.destination);
    // Monitor contains clips only: no delayed voice or microphone feedback.
    this.clips.connect(this.monitorBus); this.monitorBus.connect(this.monitorStream);
    this.monitorBus.gain.value = 0;
    this.monitor.srcObject = this.monitorStream.stream;
    this.analyser.fftSize = 256;
  }
  async route(deviceId: string) {
    this.stopAll(); this.disableMic(); this.ready = false;
    await this.context.suspend();
    if (!deviceId) throw new Error('Select an output device first.');
    if (!this.context.setSinkId) throw new Error('This runtime does not support audio output selection. Run the Electron desktop app.');
    await this.context.setSinkId(deviceId);
    await this.context.resume(); this.ready = true;
  }
  async decode(data: ArrayBuffer) { return this.context.decodeAudioData(data.slice(0)); }
  async play(clip: Clip) {
    if (!this.ready) throw new Error('Connect an output device first.');
    if (this.playing.has(clip.id)) { this.stop(clip.id); return; }
    const generation = this.generation;
    await this.context.resume();
    const buffer = this.buffers.get(clip.id) ?? await this.decode(clip.data);
    this.buffers.set(clip.id, buffer);
    if (!this.ready || generation !== this.generation || this.playing.has(clip.id)) return;
    const source = this.context.createBufferSource(); const gain = this.context.createGain();
    source.buffer = buffer; gain.gain.value = clip.volume;
    source.connect(gain); gain.connect(this.clips);
    this.playing.set(clip.id, { source, gain });
    source.onended = () => { source.disconnect(); gain.disconnect(); this.playing.delete(clip.id); this.changed(); };
    source.start(); this.changed();
  }
  setClipVolume(id: string, volume: number) { const item = this.playing.get(id); if (item) item.gain.gain.value = volume; }
  forget(id: string) { this.stop(id); this.buffers.delete(id); }
  stop(id: string) { const item = this.playing.get(id); if (item) { item.source.stop(); item.source.disconnect(); item.gain.disconnect(); this.playing.delete(id); this.changed(); } }
  stopAll() { this.generation++; for (const id of [...this.playing.keys()]) this.stop(id); }
  private changed() { this.onChange([...this.playing.keys()]); }
  private micRequest = 0;
  async enableMic(deviceId: string) {
    if (!this.ready) throw new Error('Connect your virtual cable output first.');
    this.disableMic(); const request = this.micRequest;
    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false
    } });
    if (request !== this.micRequest || !this.ready) { stream.getTracks().forEach(track => track.stop()); return false; }
    this.stream = stream; this.micNode = this.context.createMediaStreamSource(stream); this.micNode.connect(this.mic);
    return true;
  }
  disableMic() { this.micRequest++; this.micNode?.disconnect(); this.micNode = undefined; this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined; }
  async setMonitor(deviceId: string) {
    this.monitor.pause(); this.monitorBus.gain.value = 0;
    if (!deviceId) return;
    await this.monitor.setSinkId(deviceId); await this.monitor.play(); this.monitorBus.gain.value = 0.65;
  }
  async disconnect() { this.ready = false; this.stopAll(); this.disableMic(); await this.context.suspend(); }
}
