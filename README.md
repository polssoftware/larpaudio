# LarpAudio

Drop an audio file, set the video title and appearance, and preview the scrolling waveform. Choose **Export full video** or choose **Export trim** and drag the two markers anywhere on the track. The trim starts at 0–30 seconds or the full track if it is shorter. Click **Render MP4**, then **Download**. LarpAudio exports 1206 × 2622 video at 30 FPS and processes both the source and the export in the browser.

## Run locally

Use Node.js 22.12 or later. Run `npm ci`, then `npm run dev`. Run `npm run build` to type-check and generate the production site in `dist`.

## Cloudflare Pages

Upload the production ZIP as a Direct Upload, or connect a Git repository and use `npm run build` as the build command and `dist` as the build output directory. The site has no server functions, environment variables, or accounts.

## Browser support

Export requires a device with browser H.264 and AAC encoding support. Use a current desktop version of Chrome or Edge for the widest compatibility. The editor uses timestamped 30 FPS video frames where WebCodecs is available. The fallback captures at a target of 30 FPS in real time, and needs the tab to stay visible. Preview and import depend on the browser's audio decoding support.
