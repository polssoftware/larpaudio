export type Appearance = {
  title: string
  theme: 'light' | 'dark'
  statusTime: string
  battery: number
}
export const outputWidth = 1206
export const outputHeight = 2622
export type ExportRange = { start: number; end: number }

const bucketsPerSecond = 120
const waveformWindowSeconds = 7
const artwork = {
  light: new URL('./artwork/light.png', import.meta.url),
  dark: new URL('./artwork/dark.png', import.meta.url),
}
const loaded = new Map<Appearance['theme'], Promise<ImageBitmap>>()

export function loadArtwork(theme: Appearance['theme']) {
  const cached = loaded.get(theme)
  if (cached) return cached
  const result = fetch(artwork[theme]).then(response => {
    if (!response.ok) throw new Error('Could not load the waveform artwork.')
    return response.blob()
  }).then(blob => createImageBitmap(blob)).catch(error => {
    loaded.delete(theme)
    throw error
  })
  loaded.set(theme, result)
  return result
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number | number[]) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.fill()
}

export function statusClock(start: string, time: number) {
  const [hours, minutes] = (start || '09:41').split(':').map(Number)
  const total = hours * 60 + minutes + Math.floor(time / 60)
  return (Math.floor(total / 60) % 12 || 12) + ':' + String(total % 60).padStart(2, '0')
}

function chrome(ctx: CanvasRenderingContext2D, settings: Appearance, dark: boolean, time: number, elapsed: number) {
  const ink = dark ? '#fff' : '#080808'
  const label = statusClock(settings.statusTime, time)
  const pulse = (1 - Math.cos(elapsed * Math.PI / 2)) / 2
  const red = [255 - 23 * pulse, 46 - 12 * pulse, 38 - 11 * pulse].map(Math.round)
  ctx.fillStyle = 'rgb(' + red.join(',') + ')'
  ctx.font = '600 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const labelWidth = Math.max(122, ctx.measureText(label).width + 46)
  rounded(ctx, 134 - labelWidth / 2, 42, labelWidth, 44, 22)
  ctx.fillStyle = '#fff'
  ctx.fillText(label, 134, 64)

  ctx.fillStyle = ink
  const bars = [12, 19, 26, 33]
  bars.forEach((height, i) => rounded(ctx, 810 + i * 13, 81 - height, 9, height, 2.4))
  for (const radius of [29, 19]) {
    ctx.beginPath()
    ctx.arc(885, 81, radius, -2.34, -0.80)
    ctx.arc(885, 81, radius - 6.5, -0.80, -2.34, true)
    ctx.closePath()
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(877, 76)
  ctx.quadraticCurveTo(885, 68, 893, 76)
  ctx.lineTo(885, 83)
  ctx.closePath()
  ctx.fill()
  const outline = dark ? '#99999e' : '#77777c'
  ctx.strokeStyle = outline
  ctx.lineWidth = 2.8
  ctx.beginPath()
  ctx.roundRect(922, 49, 67, 32, 8)
  ctx.stroke()
  ctx.fillStyle = outline
  rounded(ctx, 992, 59, 4, 12, 2)
  const fill = 55 * settings.battery / 100
  ctx.fillStyle = settings.battery < 20 ? '#ff3b30' : ink
  if (fill > 0) rounded(ctx, 928, 55, fill, 20, [Math.min(4, fill / 2), 0, 0, Math.min(4, fill / 2)])
}

function playbackBar(ctx: CanvasRenderingContext2D, accent: string, dark: boolean) {
  ctx.save()
  ctx.translate(0, 428)
  ctx.strokeStyle = accent
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.roundRect(76, 1768, 47, 37, 7)
  ctx.stroke()
  ctx.fillStyle = dark ? '#131219' : '#f4f2f8'
  ctx.fillRect(94, 1762, 12, 12)
  ctx.beginPath()
  ctx.moveTo(100, 1788)
  ctx.lineTo(100, 1749)
  ctx.moveTo(90, 1759)
  ctx.lineTo(100, 1749)
  ctx.lineTo(110, 1759)
  ctx.stroke()
  ctx.fillStyle = accent
  rounded(ctx, 951, 1759, 12, 43, 3)
  rounded(ctx, 970, 1759, 12, 43, 3)
  ctx.fillStyle = dark ? '#f6f4fa' : '#1c1922'
  rounded(ctx, 391, 1872, 298, 10, 5)
  ctx.restore()
}

export function measure(buffer: AudioBuffer) {
  const peaks = new Float32Array(Math.ceil(buffer.duration * bucketsPerSecond))
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < peaks.length; i++) {
      const end = Math.min(samples.length, Math.floor((i + 1) * buffer.sampleRate / bucketsPerSecond))
      let peak = peaks[i]
      for (let j = Math.floor(i * buffer.sampleRate / bucketsPerSecond); j < end; j++) {
        peak = Math.max(peak, Math.abs(samples[j]))
      }
      peaks[i] = peak
    }
  }
  return peaks
}

export function clock(time: number, fractional = false) {
  const milliseconds = Math.floor(Math.max(0, time) * 1000 + 0.00001)
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const basic = String(minutes).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
  return fractional ? basic + '.' + String(Math.floor(milliseconds % 1000 / 10)).padStart(2, '0') : basic
}

export function visual(ctx: CanvasRenderingContext2D, settings: Appearance, peaks: Float32Array | undefined, time: number, logo?: ImageBitmap, elapsed = time) {
  const dark = settings.theme === 'dark'
  const width = 1080
  const height = 2348
  ctx.setTransform(ctx.canvas.width / width, 0, 0, ctx.canvas.height / height, 0, 0)
  ctx.fillStyle = dark ? '#000' : '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  chrome(ctx, settings, dark, time, elapsed)
  ctx.fillStyle = dark ? '#f8f7f2' : '#25252a'
  ctx.font = '650 48px system-ui, sans-serif'
  let title = settings.title.trim() || 'New Recording'
  if (ctx.measureText(title).width > 650) {
    const letters = Array.from(title)
    while (letters.length && ctx.measureText(letters.join('') + '…').width > 650) letters.pop()
    title = letters.join('') + '…'
  }
  ctx.fillText(title, 540, 166)
  const controls = dark ? '#0a84ff' : '#007aff'
  ctx.fillStyle = controls
  ctx.font = '650 39px system-ui, sans-serif'
  ctx.fillText('Done', 956, 166)

  if (logo) ctx.drawImage(logo, 254, 890, 572, 572 * logo.height / logo.width)

  const centerY = 2083
  const spacing = 7
  const inset = 55
  const band = 96
  const pixelsPerSecond = width / waveformWindowSeconds
  const shift = time * pixelsPerSecond
  const first = Math.ceil((shift - width / 2) / spacing)
  const last = Math.floor((shift + width / 2) / spacing)
  ctx.fillStyle = dark ? '#131219' : '#f4f2f8'
  ctx.fillRect(0, 2162, width, 186)
  rounded(ctx, inset, centerY - band / 2, width - inset * 2, band, 18)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(inset, centerY - band / 2, width - inset * 2, band, 18)
  ctx.clip()
  ctx.strokeStyle = dark ? '#363640' : '#dddbd7'
  ctx.lineCap = 'butt'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, centerY)
  ctx.lineTo(width, centerY)
  ctx.stroke()
  for (let side = 0; side < 2; side++) {
    const past = side === 0
    ctx.fillStyle = past ? (dark ? '#676774' : '#aaaab4') : (dark ? '#9494a1' : '#767682')
    ctx.beginPath()
    const boundary = Math.ceil(shift / spacing)
    for (let i = past ? first : boundary; i <= (past ? boundary - 1 : last); i++) {
      const x = width / 2 + i * spacing - shift
      let level = 0
      if (peaks) {
        if (i < 0 || i * spacing / pixelsPerSecond >= peaks.length / bucketsPerSecond) continue
        const start = Math.floor(i * spacing / pixelsPerSecond * bucketsPerSecond)
        const end = Math.min(peaks.length, Math.ceil((i + 1) * spacing / pixelsPerSecond * bucketsPerSecond))
        for (let j = start; j < end; j++) level = Math.max(level, peaks[j])
      } else {
        level = (0.22 + 0.78 * Math.abs(Math.sin(i * 0.101))) *
          (0.12 + 0.88 * Math.abs(Math.sin(i * 1.37) * Math.cos(i * 0.73))) * 0.79
      }
      const bar = Math.max(2, Math.pow(Math.min(level, 1), 0.9) * 72)
      ctx.rect(x - 1.8, centerY - bar / 2, 3.6, bar)
    }
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = dark ? '#fff' : '#55555a'
  rounded(ctx, 537, centerY - band / 2, 6, band, 3)
  ctx.fillStyle = dark ? '#e6e4ed' : '#44434c'
  ctx.font = '400 35px system-ui, sans-serif'
  ctx.fillText(clock(elapsed), 540, 1995)
  playbackBar(ctx, controls, dark)
}
