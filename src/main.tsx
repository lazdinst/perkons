import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from './audio';
import { deleteClip, loadClips, saveClip, type Clip } from './storage';
import './style.css';
declare global {
  interface Window { perkons?: { setHotkeys(entries: { id: string; key: string }[]): Promise<string[]>; onHotkey(callback: (id: string) => void): () => void } }
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function App() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [output, setOutput] = useState(''); const [input, setInput] = useState('');
  const [monitor, setMonitor] = useState(''); const [mic, setMic] = useState(false);
  const [connected, setConnected] = useState(false); const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const [importing, setImporting] = useState(false);
  const [volume, setVolume] = useState(0.8); const [micVolume, setMicVolume] = useState(1);
  const engineRef = useRef<AudioEngine | null>(null); const clipsRef = useRef(clips); clipsRef.current = clips;
  const fileInput = useRef<HTMLInputElement>(null); const meterRef = useRef<HTMLMeterElement>(null);
  function engine() { if (!engineRef.current) { engineRef.current = new AudioEngine(); engineRef.current.onChange = setActive; } return engineRef.current; }
  async function refreshDevices() {
    const found = await navigator.mediaDevices.enumerateDevices(); setDevices(found);
    return found;
  }
  useEffect(() => {
    loadClips().then(setClips).catch(e => setError(`Could not load library: ${message(e)}`));
    refreshDevices().catch(e => setError(message(e)));
    const changed = async () => {
      try {
        const found = await refreshDevices();
        const audio = engineRef.current;
        if (audio?.ready && !found.some(device => device.deviceId === audio.context.sinkId)) {
          await audio.disconnect(); setConnected(false); setMic(false); setError('Output disconnected. Select a device and reconnect.');
        }
      } catch (e) { setError(message(e)); }
    };
    navigator.mediaDevices.addEventListener('devicechange', changed);
    let frame: number;
    const tick = () => { const audio = engineRef.current; if (audio && meterRef.current) {
      const data = new Uint8Array(audio.analyser.fftSize); audio.analyser.getByteTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length);
      meterRef.current.value = Math.min(1, rms * 3);
    } frame = requestAnimationFrame(tick); }; tick();
    const remove = window.perkons?.onHotkey(id => {
      if (id === '__stop') engineRef.current?.stopAll();
      else { const clip = clipsRef.current.find(c => c.id === id); if (clip) play(clip); }
    });
    return () => { cancelAnimationFrame(frame); remove?.(); navigator.mediaDevices.removeEventListener('devicechange', changed); };
  }, []);
  useEffect(() => {
    window.perkons?.setHotkeys([{ id: '__stop', key: 'Control+Alt+0' }, ...clips.filter(c => c.key).map(c => ({ id: c.id, key: c.key }))])
      .then(failed => setNotice(failed.length ? `Hotkey unavailable: ${failed.join(', ')}` : ''))
      .catch(e => setError(message(e)));
  }, [clips.map(c => `${c.id}:${c.key}`).join('|')]);
  async function play(clip: Clip) { try { setError(''); await engine().play(clip); } catch (e) { setError(message(e)); } }
  async function importFiles(files: FileList | File[]) {
    setImporting(true); setError('');
    const imported: Clip[] = []; const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error('maximum size is 50 MB');
        const data = await file.arrayBuffer(); const buffer = await engine().decode(data);
        const clip = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, ''), data, duration: buffer.duration, volume: 1, key: '' };
        await saveClip(clip); imported.push(clip);
      } catch (e) { failures.push(`${file.name}: ${message(e)}`); }
    }
    setClips(previous => [...previous, ...imported]); setImporting(false);
    if (failures.length) setError(failures.join('; '));
  }
  async function update(clip: Clip, patch: Partial<Pick<Clip, 'name' | 'volume' | 'key'>>) {
    const next = { ...clip, ...patch };
    try { await saveClip(next); setClips(previous => previous.map(c => c.id === next.id ? next : c)); engineRef.current?.setClipVolume(next.id, next.volume); }
    catch (e) { setError(message(e)); }
  }
  async function remove(clip: Clip) {
    try { await deleteClip(clip.id); engineRef.current?.forget(clip.id); setClips(previous => previous.filter(c => c.id !== clip.id)); }
    catch (e) { setError(message(e)); }
  }
  async function connect() {
    setBusy(true); setError(''); setMic(false); setConnected(false);
    try { const audio = engine(); audio.master.gain.value = volume; audio.mic.gain.value = micVolume; await audio.route(output); setConnected(true); }
    catch (e) { setError(`Could not connect: ${message(e)}`); }
    finally { setBusy(false); }
  }
  async function unlock() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); stream.getTracks().forEach(track => track.stop());
      const found = await refreshDevices(); const cable = found.find(d => d.kind === 'audiooutput' && /cable input/i.test(d.label));
      if (cable && !connected) setOutput(cable.deviceId);
    } catch (e) { setError(`Device access: ${message(e)}. Check Windows microphone privacy settings.`); }
  }
  const outputs = devices.filter(d => d.kind === 'audiooutput'); const inputs = devices.filter(d => d.kind === 'audioinput');
  const filtered = clips.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="app">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">ϟ</span><span>Pērkons<small>MAKE SOME THUNDER</small></span></div>
      <div className="section-label">WORKSPACE</div><div className="nav-item"><span>▦ &nbsp; Sound library</span><span className="count">{clips.length}</span></div>
      <div className="route-map"><div className="section-label">SIGNAL PATH</div><p>Clips <span>+ optional mic</span></p><div className="route-line">↓</div><p>Virtual cable</p><div className="route-line">↓</div><p>Discord · Games · Calls</p></div>
      <div className="sidebar-foot"><span className={`dot ${connected ? 'online' : ''}`} />{connected ? 'Audio connected' : 'Output not connected'}<small>Windows · v0.1.0</small></div>
    </aside>
    <main>
      <header><div><div className="eyebrow">YOUR SOUND, ON CUE</div><h1>Sound library<span>.</span></h1><p>A little thunder for every conversation.</p></div><button className="primary" onClick={() => fileInput.current?.click()} disabled={importing}>{importing ? 'Importing…' : '+ Import sounds'}</button></header>
      <input ref={fileInput} className="hidden" type="file" multiple accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a" aria-label="Import audio files" onChange={event => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} />
      <div className="setup"><span className="setup-icon">↗</span><div><strong>Send your sounds into the conversation</strong><p>Install VB-CABLE separately. Select <b>CABLE Input</b> below, then choose <b>CABLE Output</b> as the microphone in your chat app.</p></div><button onClick={() => void unlock()}>Find devices</button></div>
      {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <section className="routing" aria-label="Audio routing">
        <div className="routing-head"><h2><span className={`dot ${connected ? 'online' : ''}`} /> Audio routing</h2><span>{connected ? 'CONNECTED' : 'SET UP YOUR OUTPUT'}</span></div>
        <div className="routing-grid"><label>Soundboard output<select aria-label="Soundboard output" value={output} disabled={busy || connected} onChange={e => setOutput(e.target.value)}><option value="">Choose virtual cable…</option>{outputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || `Output ${d.deviceId.slice(0, 6)}`}</option>)}</select></label>
          <button className={connected ? '' : 'primary'} disabled={busy || !output} onClick={() => { if (connected) { void engine().disconnect(); setConnected(false); setMic(false); } else void connect(); }}>{busy ? 'Connecting…' : connected ? 'Disconnect' : 'Connect output'}</button>
          <label>Headphone preview<select aria-label="Headphone preview" value={monitor} disabled={busy} onChange={async e => { const value = e.target.value; setBusy(true); try { await engine().setMonitor(value); setMonitor(value); } catch (e) { setMonitor(''); setError(message(e)); } finally { setBusy(false); } }}><option value="">Off</option>{outputs.filter(d => !/cable|voicemeeter/i.test(d.label)).map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Default headphones'}</option>)}</select></label></div>
        <div className="mic-row"><label>Physical microphone<select aria-label="Physical microphone" value={input} disabled={mic || busy} onChange={e => setInput(e.target.value)}><option value="">Default microphone</option>{inputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}</select></label>
          <button className={mic ? 'enabled' : ''} disabled={!connected || busy} aria-pressed={mic} onClick={async () => { setBusy(true); try { if (mic) { engine().disableMic(); setMic(false); } else setMic(await engine().enableMic(input)); } catch (e) { setMic(false); setError(message(e)); } finally { setBusy(false); } }}>{mic ? '● Mic included' : '+ Include my mic'}</button>
          <label className="slider-label">Voice level <input type="range" aria-label="Voice level" min="0" max="1.5" step="0.01" value={micVolume} onChange={e => { const v = +e.target.value; setMicVolume(v); engine().mic.gain.value = v; }} /></label></div>
        <p className="routing-note">Use a virtual cable for voice mixing. Selecting speakers can cause microphone feedback. Preview plays clips only.</p>
      </section>
      <div className="library-toolbar"><div><h2>All sounds <span>{clips.length}</span></h2><small>Click a pad to play. Click again to stop.</small></div><input type="search" placeholder="Search your sounds…" aria-label="Search sounds" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <section className="library" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!importing) void importFiles(e.dataTransfer.files); }} aria-label="Sound library">
        {!clips.length ? <div className="empty"><div className="empty-icon">≋</div><h2>Your next sound starts here.</h2><p>Drop audio files here, or import your favorites.<br />MP3, WAV, OGG, FLAC, and supported M4A · up to 50 MB each</p><button onClick={() => fileInput.current?.click()} disabled={importing}>Choose audio files</button></div>
          : !filtered.length ? <div className="empty"><h2>No matching sounds</h2><p>Try a different search.</p></div>
          : <div className="pads">{filtered.map((clip, i) => <article className={`pad ${active.includes(clip.id) ? 'playing' : ''}`} key={clip.id}>
            <button className="play-pad" onClick={() => void play(clip)} aria-label={`${active.includes(clip.id) ? 'Stop' : 'Play'} ${clip.name}`}><span className="pad-top"><span className="pad-index">{String(i + 1).padStart(2, '0')}</span><span className="play-icon">{active.includes(clip.id) ? '■' : '▶'}</span></span><strong>{clip.name}</strong><span className="pad-duration">{active.includes(clip.id) ? 'PLAYING' : time(clip.duration)}</span></button>
            <div className="pad-controls"><label title="Clip volume"><span>VOL</span><input aria-label={`Volume for ${clip.name}`} type="range" min="0" max="1" step="0.01" value={clip.volume} onChange={e => void update(clip, { volume: +e.target.value })} /></label><select aria-label={`Hotkey for ${clip.name}`} value={clip.key} onChange={e => void update(clip, { key: e.target.value })}><option value="">No hotkey</option>{Array.from({ length: 9 }, (_, i) => `Control+Alt+${i + 1}`).filter(key => key === clip.key || !clips.some(c => c.key === key)).map(key => <option key={key} value={key}>{key.replace('Control', 'Ctrl')}</option>)}</select><button className="delete" aria-label={`Remove ${clip.name}`} onClick={() => void remove(clip)}>×</button></div>
          </article>)}</div>}
      </section>
      <footer><div><span className="dot online" />{active.length ? `${active.length} playing` : 'Ready when you are'}</div><label className="master-volume">Master <input type="range" aria-label="Master volume" min="0" max="1" step="0.01" value={volume} onChange={e => { const v = +e.target.value; setVolume(v); engine().master.gain.value = v; }} /><span>{Math.round(volume * 100)}%</span></label><meter ref={meterRef} min="0" max="1" value="0" aria-label="Output level" /><button className="stop-all" onClick={() => engineRef.current?.stopAll()}>■ Stop all <kbd>Ctrl Alt 0</kbd></button></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
