import { loadArtwork, outputWidth, outputHeight, visual, type Appearance, type ExportRange } from './visual'

const fps = 30
const types = [
  'video/mp4;codecs="avc1.420032,mp4a.40.2"',
  'video/mp4;codecs="avc1.420034,mp4a.40.2"',
  'video/mp4;codecs="avc1.420028,mp4a.40.2"',
  'video/mp4;codecs="avc1,mp4a.40.2"',
  'video/mp4;codecs="avc1,mp4a"',
]

export function mp4Type() {
  return typeof MediaRecorder === 'undefined' ? undefined :
    types.find(type => MediaRecorder.isTypeSupported(type))
}

async function renderWithWorker(
  buffer: AudioBuffer,
  peaks: Float32Array,
  settings: Appearance,
  range: ExportRange,
  signal: AbortSignal,
  onProgress: (value: number) => void,
): Promise<Blob | null> {
  signal.throwIfAborted()
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window) || buffer.numberOfChannels > 2) return null
  const worker = new Worker(new URL('./encode-worker.js', import.meta.url), { type: 'module' })
  const first = Math.round(range.start * buffer.sampleRate)
  const end = Math.round(range.end * buffer.sampleRate)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice(first, end))
  const waveform = peaks.slice()
  let abort = () => {}
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      worker.onmessage = ({ data }) => {
        if (typeof data.progress === 'number') onProgress(data.progress)
        else if (data.error) reject(new Error(data.error))
        else resolve(data.blob)
      }
      worker.onerror = () => reject(new Error('Could not start the video encoder.'))
      worker.postMessage({ channels, rate: buffer.sampleRate, peaks: waveform, settings, start: first / buffer.sampleRate }, [
        ...channels.map(channel => channel.buffer), waveform.buffer,
      ])
    })
  } finally {
    signal.removeEventListener('abort', abort)
    worker.terminate()
  }
}

export async function renderMp4(
  buffer: AudioBuffer,
  peaks: Float32Array,
  settings: Appearance,
  range: ExportRange,
  signal: AbortSignal,
  onProgress: (value: number) => void,
) {
  const mimeType = mp4Type()
  try {
    const result = await renderWithWorker(buffer, peaks, settings, range, signal, onProgress)
    if (result) return result
  } catch (failure) {
    signal.throwIfAborted()
    if (!mimeType) throw failure
    onProgress(0)
  }
  if (!mimeType) throw new Error('H.264 and AAC encoding is unavailable in this browser. Try desktop Chrome or Edge.')
  return recordMp4(buffer, peaks, settings, range, signal, onProgress, mimeType)
}

async function recordMp4(
  buffer: AudioBuffer,
  peaks: Float32Array,
  settings: Appearance,
  range: ExportRange,
  signal: AbortSignal,
  onProgress: (value: number) => void,
  mimeType: string,
) {
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const duration = range.end - range.start
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx || !canvas.captureStream) throw new Error('This browser cannot capture the video canvas.')
  const artwork = await loadArtwork(settings.theme)
  signal.throwIfAborted()
  visual(ctx, settings, peaks, range.start, artwork, 0)
  const audio = new AudioContext({ sampleRate: buffer.sampleRate })
  const source = audio.createBufferSource()
  source.buffer = buffer
  const destination = audio.createMediaStreamDestination()
  destination.channelCount = Math.min(2, buffer.numberOfChannels)
  const video = canvas.captureStream(fps)
  const stream = new MediaStream([...video.getTracks(), ...destination.stream.getTracks()])
  let recorder: MediaRecorder | undefined
  let frame = 0
  let lastFrame = -1
  const cancel = () => { if (recorder?.state === 'recording') recorder.stop() }
  const visibility = () => { if (document.hidden) cancel() }
  try {
    signal.throwIfAborted()
    await audio.resume()
    signal.throwIfAborted()
    if (document.hidden) throw new Error('Keep LarpAudio visible while rendering.')
    source.connect(destination)
    const active = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 })
    recorder = active
    const chunks: Blob[] = []
    const result = new Promise<Blob>((resolve, reject) => {
      active.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      active.onerror = () => reject(new Error('MP4 encoding failed on this device.'))
      active.onstop = () => resolve(new Blob(chunks, { type: 'video/mp4' }))
    })
    signal.addEventListener('abort', cancel, { once: true })
    document.addEventListener('visibilitychange', visibility)
    let hidden = false
    const markHidden = () => { hidden ||= document.hidden }
    document.addEventListener('visibilitychange', markHidden)
    try {
      active.start(1000)
      const start = audio.currentTime
      source.onended = cancel
      source.start(start, range.start, duration)
      const paint = () => {
        const time = Math.max(0, audio.currentTime - start)
        const index = Math.floor(time * fps)
        if (index !== lastFrame) {
          visual(ctx, settings, peaks, Math.min(range.start + time, range.end), artwork, time)
          onProgress(Math.min(0.99, time / duration))
          lastFrame = index
        }
        frame = requestAnimationFrame(paint)
      }
      paint()
      const blob = await result
      signal.throwIfAborted()
      if (hidden) throw new Error('Rendering stopped when the tab was hidden. Keep LarpAudio visible and render again.')
      if (!blob.size) throw new Error('The encoder returned an empty video.')
      return blob
    } finally {
      document.removeEventListener('visibilitychange', markHidden)
    }
  } finally {
    cancelAnimationFrame(frame)
    signal.removeEventListener('abort', cancel)
    document.removeEventListener('visibilitychange', visibility)
    cancel()
    stream.getTracks().forEach(track => track.stop())
    source.disconnect()
    await audio.close()
  }
}
