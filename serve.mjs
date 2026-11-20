import { spawn } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'

const dist = new URL('./dist/', import.meta.url)
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', png: 'image/png' }
const host = '127.0.0.1'
const port = 4173
let files

try {
  const assets = await readdir(new URL('assets/', dist), { withFileTypes: true })
  files = new Map([['/', await readFile(new URL('index.html', dist))]])
  files.set('/index.html', files.get('/'))
  for (const entry of assets) {
    if (!entry.isFile() || !/^[\w.-]+\.(css|js|png)$/.test(entry.name)) continue
    const path = 'assets/' + entry.name
    files.set('/' + path, await readFile(new URL(path, dist)))
  }
} catch {
  console.error('The built website is missing. Extract the full Windows ZIP before starting.')
  process.exit(1)
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  const path = request.url?.split('?')[0]
  const body = files.get(path)
  if (!body) {
    response.writeHead(404).end()
    return
  }
  const type = types[path === '/' ? 'html' : path.split('.').at(-1)]
  response.writeHead(200, {
    'Content-Type': type,
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(request.method === 'HEAD' ? undefined : body)
})

let tryDefaultPort = true
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && tryDefaultPort) {
    tryDefaultPort = false
    server.listen(0, host)
    return
  }
  console.error('Could not start LarpAudio. ' + error.message)
  process.exitCode = 1
})
server.once('listening', () => {
  const url = 'http://' + host + ':' + server.address().port + '/'
  console.log('LarpAudio is running at ' + url)
  console.log('Close this window to stop LarpAudio.')
  if (process.argv.includes('--no-open')) return
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
    stdio: 'ignore',
    windowsHide: true,
  })
  browser.on('error', () => console.log('Open ' + url + ' in your browser.'))
  browser.on('exit', code => { if (code !== 0) console.log('Open ' + url + ' in your browser.') })
})
server.listen(port, host)
