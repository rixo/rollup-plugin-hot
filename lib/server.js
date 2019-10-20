const path = require('path')
const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const cors = require('cors')

const { debug, posixify, distUrl, runtimeDir } = require('./utils')

// this looks ridiculous, but it prevents sourcemap tooling from mistaking
// this for an actual sourceMappingURL
let SOURCEMAPPING_URL = 'sourceMa'
SOURCEMAPPING_URL += 'ppingURL'

const createServer = ({ clearConsole, inMemory = false }) => {
  const app = express()

  app.use(distUrl, express.static(runtimeDir))

  const server = http.createServer(app)
  const wss = new WebSocket.Server({ server })

  const sockets = new Set()

  wss.on('connection', ws => {
    sockets.add(ws)

    debug('client connected')

    ws.send(JSON.stringify({ greeting: { clearConsole, inMemory } }))

    ws.on('close', () => {
      debug('client disconnected')
      sockets.delete(ws)
    })
  })

  server.broadcast = message => {
    sockets.forEach(socket => {
      socket.send(JSON.stringify(message))
    })
  }

  const modules = {}

  server.writeBundle = (baseUrl, bundle, { sourcemap } = {}) => {
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
    app.use(cors())
    app.get('*', (req, res, next) => {
      const mod = modules[req.path]
      if (mod) {
        res.send(mod)
      } else {
        next()
      }
    })
  }

  return server
}

module.exports = createServer
