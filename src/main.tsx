import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { clock, loadArtwork, measure, outputWidth, outputHeight, visual, type Appearance, type ExportRange } from './visual'
import { renderMp4 } from './export'
import './style.css'

type Track = { file: File; buffer: AudioBuffer; peaks: Float32Array; url: string }
type IconName = 'wave' | 'file' | 'upload' | 'play' | 'pause' | 'download' | 'sun' | 'moon' | 'expand' | 'github' | 'code' | 'sparkles' | 'chevron'
const paths: Record<IconName, string> = {
  wave: 'M3 10v4m4-7v10m5-15v20m5-15v10m4-7v4',
  file: 'M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Zm0 0v7h7M8 15v2m4-4v6m4-4v2',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  play: 'm9 5 11 7-11 7z',
  pause: 'M9 5v14m6-14v14',
  download: 'M12 4v12m-5-5 5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z',
  expand: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  github: 'M9 19c-4 1-4-2-6-2m12 5v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.1-1.5 6.1-6.7a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6S17.6 1.3 15 3a13 13 0 0 0-6 0C6.4 1.3 5.3 1.6 5.3 1.6a4.8 4.8 0 0 0-.1 3.6 5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.1 6.4 6.1 6.7a3.4 3.4 0 0 0-.9 2.6V22',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18',
  sparkles: 'M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3L12 2Zm7 1v4m-2-2h4',
  chevron: 'm6 9 6 6 6-6',
}
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

function GitHubDropdown() {
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (menu.current && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])

  return <details className="github-dropdown" ref={menu} onKeyDown={event => {
    if (event.key !== 'Escape' || !event.currentTarget.open) return
    event.currentTarget.open = false
    event.currentTarget.querySelector('summary')?.focus()
  }}>
    <summary className="github-link"><Icon name="github" size={16} /> GitHub <Icon name="chevron" size={14} /></summary>
    <div className="github-panel">
      <a href="https://github.com/polssoftware/larpaudio" target="_blank" rel="noopener noreferrer"><Icon name="code" size={16} /> Source</a>
      <a href="https://github.com/polssoftware" target="_blank" rel="noopener noreferrer"><Icon name="github" size={16} /> GitHub</a>
      <div className="github-credit"><Icon name="sparkles" size={14} /> Created with AI</div>
    </div>
  </details>
}

const defaults: Appearance = { title: '', theme: 'light', statusTime: '09:41', battery: 73 }
const defaultClipEnd = 30
function App() {
  const [settings, setSettings] = useState(defaults)
  const [artwork, setArtwork] = useState<{ theme: Appearance['theme']; image: ImageBitmap }>()
  const [track, setTrack] = useState<Track>()
  const [trimmed, setTrimmed] = useState(false)
  const [clip, setClip] = useState<ExportRange>({ start: 0, end: defaultClipEnd })
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [progress, setProgress] = useState<number>()
  const [download, setDownload] = useState<{ url: string; name: string }>()
  const audio = useRef<HTMLAudioElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const job = useRef<AbortController | null>(null)
  const dragDepth = useRef(0)
  const importing = useRef(false)
  const busy = progress !== undefined
  const duration = track?.buffer.duration ?? 0
  const range = trimmed ? clip : { start: 0, end: duration }
  useEffect(() => {
    let current = true
    const theme = settings.theme
    loadArtwork(theme).then(image => {
      if (current) setArtwork({ theme, image })
    }).catch(() => {
      if (current) setError('The waveform artwork could not be loaded.')
    })
    return () => { current = false }
  }, [settings.theme])
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { alpha: false })
    if (ctx) visual(ctx, settings, track?.peaks, time, artwork?.theme === settings.theme ? artwork.image : undefined, Math.max(0, time - (trimmed ? clip.start : 0)))
  }, [settings, track, time, artwork, trimmed, clip.start])
  useEffect(() => {
    if (!playing) return
    let frame: number
    const tick = () => {
      if (audio.current) setTime(audio.current.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])
  useEffect(() => () => { if (track) URL.revokeObjectURL(track.url) }, [track])
  useEffect(() => () => { if (download) URL.revokeObjectURL(download.url) }, [download])
  useEffect(() => () => job.current?.abort(), [])

  async function load(file?: File) {
    if (!file || importing.current || job.current) return
    importing.current = true
    setLoading(true)
    setError('')
    audio.current?.pause()
    try {
      const context = new AudioContext({ sampleRate: 48000 })
      let buffer: AudioBuffer
      try {
        buffer = await context.decodeAudioData(await file.arrayBuffer())
      } catch {
        throw new Error('This file could not be read as audio. Try an MP3 or WAV file.')
      } finally {
        await context.close()
      }
      const title = file.name.replace(/\.[^.]+$/, '') || 'Untitled audio'
      setTrack({ file, buffer, peaks: measure(buffer), url: URL.createObjectURL(file) })
      setTrimmed(false)
      setClip({ start: 0, end: Math.min(defaultClipEnd, buffer.duration) })
      setSettings(previous => ({ ...previous, title }))
      setFilename(title)
      setTime(0)
      setDownload(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open this audio file.')
    } finally {
      importing.current = false
      setLoading(false)
    }
  }

  function update<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setSettings(previous => ({ ...previous, [key]: value }))
    setDownload(undefined)
  }

  async function togglePlayback() {
    const player = audio.current
    if (!player || !track) return
    if (!player.paused) return player.pause()
    if (player.ended) player.currentTime = 0
    try { await player.play() } catch { setError('Preview playback could not start.') }
  }

  function setMarker(marker: keyof ExportRange, value: number) {
    const minimum = Math.min(1 / 30, duration)
    const start = marker === 'start' ? Math.min(value, Math.max(0, clip.end - minimum)) : clip.start
    const end = marker === 'end' ? Math.min(duration, Math.max(value, clip.start + minimum)) : clip.end
    setClip({ start, end })
    setDownload(undefined)
    if (audio.current) {
      audio.current.pause()
      audio.current.currentTime = marker === 'start' ? start : end
      setTime(audio.current.currentTime)
    }
  }

  async function render() {
    if (!track || job.current) return
    audio.current?.pause()
    const controller = new AbortController()
    job.current = controller
    setProgress(0)
    setError('')
    setDownload(undefined)
    try {
      const blob = await renderMp4(track.buffer, track.peaks, settings, range, controller.signal, setProgress)
      const cleaned = filename.trim().replace(/\.mp4$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '')
      setDownload({ url: URL.createObjectURL(blob), name: (cleaned || 'larpaudio') + '.mp4' })
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not render the video.')
    } finally {
      job.current = null
      setProgress(undefined)
    }
  }

  return <>
    <header className="top"><div className="top-inner">
      <div className="brand"><span className="brand-icon"><Icon name="wave" size={21} /></span>LarpAudio</div>
      <GitHubDropdown />
    </div></header>

    <main>
      <div className="intro"><h1>Larp as a certain phone</h1><p>Design is not truly accurate, you might get caught larping</p></div>
      {error && <div className="error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      <div className="workspace">
        <div className="controls">
          <section className="panel">
            <h2><Icon name="file" /> Audio source</h2>
            <input ref={input} type="file" hidden accept="audio/*,.m4a,.flac,.ogg,.opus,.aac,.wav,.mp3" onChange={event => { void load(event.target.files?.[0]); event.target.value = '' }} />
            <button className={'drop ' + (drag ? 'drag' : '')} disabled={busy || loading}
              onClick={() => input.current?.click()}
              onDragEnter={event => { event.preventDefault(); dragDepth.current++; setDrag(true) }}
              onDragOver={event => event.preventDefault()}
              onDragLeave={() => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDrag(false) } }}
              onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDrag(false); void load(event.dataTransfer.files[0]) }}>
              <span className="upload-icon"><Icon name={track ? 'file' : 'upload'} size={21} /></span>
              <strong>{loading ? 'Reading audio…' : track ? track.file.name : 'Drop your audio here'}</strong>
              <span>{track ? clock(track.buffer.duration, true) + ' · Click or drop to replace' : <>or <b>browse files</b></>}</span>
              {!track && <small>MP3, WAV, M4A, FLAC, OGG</small>}
            </button>
          </section>

          <section className="panel">
            <h2><Icon name="wave" /> Appearance</h2>
            <fieldset disabled={busy}>
              <label className="field">Video title<input type="text" placeholder="New Recording" value={settings.title} maxLength={160} onChange={event => update('title', event.target.value)} /></label>
              <div><div className="label" id="theme-label">Video theme</div>
                  <div className="segments" role="group" aria-labelledby="theme-label">
                    {(['light', 'dark'] as const).map(theme => <button key={theme} aria-pressed={settings.theme === theme} onClick={() => update('theme', theme)}><Icon name={theme === 'light' ? 'sun' : 'moon'} size={15} /> {theme === 'light' ? 'Light' : 'Dark'}</button>)}
                  </div>
              </div>
              <div className="split">
                <label className="field">Status time<input type="time" value={settings.statusTime} onChange={event => update('statusTime', event.target.value)} /></label>
                <label className="field">Battery (%)<input type="number" min="0" max="100" step="1" value={settings.battery} onChange={event => update('battery', Math.max(0, Math.min(100, Math.round(event.target.valueAsNumber || 0))))} /></label>
              </div>
              <button className="randomize" type="button" onClick={() => {
                const pick = (max: number) => Math.floor(Math.random() * max)
                const statusTime = String(1 + pick(12)).padStart(2, '0') + ':' + String(pick(60)).padStart(2, '0')
                setSettings(previous => ({ ...previous, statusTime, battery: 1 + pick(100) }))
                setDownload(undefined)
              }}>Randomize time and battery</button>
            </fieldset>
          </section>

          <section className="panel output">
            <h2><Icon name="download" /> Export</h2>
            <fieldset className="trim" disabled={busy || !track || loading}>
              <div className="segments" role="group" aria-label="Export length">
                <button aria-pressed={!trimmed} onClick={() => { setTrimmed(false); setDownload(undefined) }}>Export full video</button>
                <button aria-pressed={trimmed} onClick={() => { setTrimmed(true); setDownload(undefined) }}>Export trim</button>
              </div>
              {trimmed && <div className="trim-control">
                <div className="trim-labels"><span>Start {clock(clip.start, true)}</span><output>{clock(clip.end - clip.start, true)}</output><span>End {clock(clip.end, true)}</span></div>
                <div className="trim-track">
                  <div className="trim-selection" style={{ left: 100 * clip.start / duration + '%', right: 100 * (duration - clip.end) / duration + '%' }} />
                  <input type="range" min="0" max={duration} step="any" value={clip.start} aria-label="Trim start" onChange={event => setMarker('start', event.target.valueAsNumber)} />
                  <input type="range" min="0" max={duration} step="any" value={clip.end} aria-label="Trim end" onChange={event => setMarker('end', event.target.valueAsNumber)} />
                </div>
              </div>}
            </fieldset>
            <label className="field">Output filename<div className="filename"><input type="text" disabled={busy} placeholder="larpaudio" value={filename} onChange={event => { setFilename(event.target.value); setDownload(undefined) }} /><span>.mp4</span></div></label>
            {busy ? <div className="render-status"><div><span role="status">Rendering MP4 · {Math.floor(progress * 100)}%</span><button onClick={() => job.current?.abort()}>Cancel</button></div><progress max="1" value={progress} /></div> :
              <button className="primary" disabled={!track || loading} onClick={() => void render()}><Icon name="download" /> Render MP4</button>}
            {download && <a className="download" href={download.url} download={download.name}>Download {download.name}</a>}
            <div className="format">{outputWidth} × {outputHeight} <span>·</span> 30 FPS <span>·</span> H.264 + AAC</div>
          </section>
        </div>

        <section className="panel preview">
          <div className="preview-head"><h2>Video preview</h2><span>Portrait</span></div>
          <div className="stage" ref={stage}><canvas ref={canvas} width={outputWidth / 2} height={outputHeight / 2} aria-label="Vertical audio waveform video preview" />
            <button className="expand" aria-label="Toggle fullscreen preview" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void stage.current?.requestFullscreen?.().catch(() => {}) }}><Icon name="expand" size={16} /></button></div>
          <div className="transport">
            <button disabled={!track || busy || loading} onClick={() => void togglePlayback()} aria-label={playing ? 'Pause preview' : 'Play preview'}><Icon name={playing ? 'pause' : 'play'} size={17} /></button>
            <span>{clock(time)}</span>
            <input aria-label="Preview position" type="range" min="0" max={track?.buffer.duration || 1} step="any" value={time} disabled={!track || busy || loading} onChange={event => { if (audio.current) audio.current.currentTime = Number(event.target.value); setTime(Number(event.target.value)) }} />
            <span>{clock(track?.buffer.duration || 0)}</span>
          </div>
          <audio ref={audio} src={track?.url} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onSeeked={() => { if (audio.current) setTime(audio.current.currentTime) }} />
        </section>
      </div>
    </main>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)

