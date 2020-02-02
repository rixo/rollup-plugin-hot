const path = require('path')
const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const cors = require('cors')
const { isIP } = require('net')

const { debug, posixify, distUrl, runtimeDir } = require('./utils')

// this looks ridiculous, but it prevents sourcemap tooling from mistaking
// this for an actual sourceMappingURL
let SOURCEMAPPING_URL = 'sourceMa'
SOURCEMAPPING_URL += 'ppingURL'

const resolveFreePort = async preferredPort => {
  const net = require('net')
  const server = net.createServer()
  return new Promise((resolve, reject) => {
    let port = preferredPort
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        port = 0
        server.close()
      } else {
        reject(err)
      }
    })
    server.once('listening', () => {
      server.close()
    })
    server.once('close', () => {
      resolve(port)
    })
    server.listen(preferredPort)
  })
}

const formatHost = ({ address }) => {
  switch (isIP(address)) {
    case 4:
      return address
    case 6:
      return `[${address}]`
    default:
      return address
  }
}

const createServer = ({
  clearConsole,
  inMemory = false,
  reload,
  autoAccept,
  cors: corsOption = true,
}) => {
  const app = express()

  if (corsOption) {
    app.use(cors({ ...corsOption }))
  }

  app.use(distUrl, express.static(runtimeDir))

  const server = http.createServer(app)
  const wss = new WebSocket.Server({ server })

  const sockets = new Set()

  wss.on('connection', ws => {
    sockets.add(ws)

    debug('client connected')

    ws.send(
      JSON.stringify({
        greeting: { clearConsole, inMemory, reload, autoAccept },
      })
    )

    ws.on('close', () => {
      debug('client disconnected')
      sockets.delete(ws)
    })
  })

  const broadcast = message => {
    sockets.forEach(socket => {
      socket.send(JSON.stringify(message))
    })
  }

  const modules = {}

  const writeBundle = (baseUrl, bundle, { sourcemap } = {}) => {
    for (const { fileName, code, map } of Object.values(bundle)) {
      const key = baseUrl + posixify(fileName)
      let source = code
      if (map && sourcemap) {
        let url
        if (sourcemap === 'inline') {
          url = map.toUrl()
        } else {
          url = `${path.basename(fileName)}.map`
          modules[`${key}.map`] = map.toString()
        }
        if (sourcemap !== 'hidden') {
          source += `//# ${SOURCEMAPPING_URL}=${url}\n`
        }
      }
      modules[key] = source
    }
  }

  if (inMemory) {
    app.get('*', (req, res, next) => {
      const key = decodeURIComponent(req.path)
      const mod = modules[key]
      if (mod) {
        res
          .set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          })
          .send(mod)
      } else {
        next()
      }
    })
  }

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    server.close()
  }

  const listen = async (preferredPort, host, fallback) => {
    const port = await resolveFreePort(preferredPort)
    if (port !== preferredPort && !fallback) {
      throw new Error(`Port ${preferredPort} is already busy`)
    }
    return new Promise((resolve, reject) => {
      server.listen(port, host, function(err) {
        if (err) {
          reject(err)
        } else {
          const addr = this.address()
          const result = { ...addr, host: formatHost(addr) }
          resolve(result)
        }
      })
    })
  }

  return {
    broadcast,
    writeBundle,
    close,
    listen,
  }
}

module.exports = createServer
