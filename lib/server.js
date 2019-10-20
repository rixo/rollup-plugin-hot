const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const cors = require('cors')

const { debug, posixify, distUrl, runtimeDir } = require('./utils')

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

  if (inMemory) {
    const modules = {}

    app.use(cors())

    app.get('*', (req, res, next) => {
      const mod = modules[req.path]
      if (mod) {
        res.send(mod)
      } else {
        next()
      }
    })

    server.writeBundle = (baseUrl, bundle) => {
      for (const { fileName, code } of Object.values(bundle)) {
        const key = baseUrl + posixify(fileName)
        modules[key] = code
      }
    }
  }

  return server
}

module.exports = createServer
