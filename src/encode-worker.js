import { loadArtwork, outputWidth as width, outputHeight as height, visual } from './visual'
import { makeMp4 } from './mp4.js'

const fps = 30
const bitrate = 192000

function accept(track, chunk, metadata) {
  if (metadata?.decoderConfig?.description) {
    track.description = new Uint8Array(metadata.decoderConfig.description)
  }
  const data = new Uint8Array(chunk.byteLength)
  chunk.copyTo(data)
  track.samples.push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' })
}

async function waitForQueue(encoder) {
  while (encoder.state === 'configured' && encoder.encodeQueueSize >= 6) {
    await new Promise(resolve => {
      const wake = () => {
        clearTimeout(timer)
        encoder.removeEventListener('dequeue', wake)
        resolve()
      }
      const timer = setTimeout(wake, 50)
      encoder.addEventListener('dequeue', wake, { once: true })
    })
  }
}

async function encode({ channels, rate, peaks, settings, start }) {
  if (!self.VideoEncoder || !self.AudioEncoder || !self.OffscreenCanvas) return null
  const videoConfig = {
    codec: 'avc1.420032', width, height, bitrate: 7000000, framerate: fps,
    latencyMode: 'realtime', avc: { format: 'avc' },
  }
  const audioConfig = { codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: channels.length, bitrate }
  const hardwareConfig = { ...videoConfig, hardwareAcceleration: 'prefer-hardware' }
  const [supportsVideo, supportsAudio, supportsHardware] = await Promise.all([
    VideoEncoder.isConfigSupported(videoConfig),
    AudioEncoder.isConfigSupported(audioConfig),
    VideoEncoder.isConfigSupported(hardwareConfig),
  ])
  if ((!supportsVideo.supported && !supportsHardware.supported) || !supportsAudio.supported) return null
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return null
  const artwork = await loadArtwork(settings.theme)
  const video = { width, height, timescale: fps, samples: [] }
  const audio = { timescale: rate, channels: channels.length, bitrate, samples: [] }
  let failure
  const error = cause => { failure = cause }
  const picture = new VideoEncoder({ output: (chunk, metadata) => accept(video, chunk, metadata), error })
  const sound = new AudioEncoder({ output: (chunk, metadata) => accept(audio, chunk, metadata), error })
  const length = channels[0].length
  const count = Math.ceil(length / rate * fps)
  const microseconds = frame => Math.round(frame * 1e6 / fps)
  try {
    picture.configure(supportsHardware.supported ? hardwareConfig : videoConfig)
    sound.configure(audioConfig)
    for (let i = 0; i < count; i++) {
      if (failure) throw failure
      visual(ctx, settings, peaks, start + i / fps, artwork, i / fps)
      const timestamp = microseconds(i)
      const frame = new VideoFrame(canvas, { timestamp, duration: microseconds(i + 1) - timestamp })
      try { picture.encode(frame, { keyFrame: i % (fps * 2) === 0 }) }
      finally { frame.close() }
      if (picture.encodeQueueSize >= 6) await waitForQueue(picture)
      if (i % 6 === 0) self.postMessage({ progress: 0.88 * i / count })
    }
    await picture.flush()
    if (video.samples.length !== count || video.samples.some((sample, i) => sample.timestamp !== microseconds(i))) {
      throw new Error('The H.264 encoder returned an incomplete frame sequence.')
    }
    for (const sample of video.samples) sample.duration = 1

    for (let offset = 0; offset < length; offset += 4096) {
      if (failure) throw failure
      const frames = Math.min(4096, length - offset)
      const data = new Float32Array(frames * channels.length)
      channels.forEach((channel, i) => data.set(channel.subarray(offset, offset + frames), i * frames))
      const sample = new AudioData({
        format: 'f32-planar', sampleRate: rate, numberOfChannels: channels.length,
        numberOfFrames: frames, timestamp: Math.round(offset * 1e6 / rate), data,
      })
      try { sound.encode(sample) }
      finally { sample.close() }
      if (sound.encodeQueueSize >= 6) await waitForQueue(sound)
      if (offset % 32768 === 0) self.postMessage({ progress: 0.88 + 0.11 * offset / length })
    }
    await sound.flush()
    if (failure) throw failure
    const first = audio.samples[0]?.timestamp ?? 0
    const position = sample => Math.round((sample.timestamp - first) * rate / 1e6)
    audio.samples.forEach((sample, i) => {
      const next = audio.samples[i + 1]
      sample.duration = Math.min(length, next ? position(next) : length) - position(sample)
    })
    audio.samples = audio.samples.filter(sample => sample.duration > 0)
    return makeMp4(video, audio)
  } finally {
    if (picture.state !== 'closed') picture.close()
    if (sound.state !== 'closed') sound.close()
  }
}

self.onmessage = async event => {
  try {
    const blob = await encode(event.data)
    self.postMessage({ blob })
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : 'MP4 encoding failed.' })
  }
}

