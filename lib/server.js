const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const path = require('path')
const fs = require('fs')

const debug = (...args) => console.debug('[HMR Server]', ...args)

const createServer = ({ port }) => {
  const app = express()

  app.get('/hmr-client.js', (req, res) => {
    const clientPath = path.resolve(__dirname, '..', 'hmr-client.js')
    res.sendFile(clientPath)
  })

  const server = http.createServer(app)
  const wss = new WebSocket.Server({ server })

  const sockets = new Set()

  wss.on('connection', ws => {
    sockets.add(ws)

    debug('client connected')

    ws.send(JSON.stringify({ greeting: true }))

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

  return server
}

module.exports = createServer
