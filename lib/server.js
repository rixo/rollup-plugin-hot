const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const path = require('path')

const { debug } = require('./utils')

const createServer = ({ clearConsole }) => {
  const app = express()

  app.use('/runtime', express.static(path.join(__dirname, '..', 'dist')))

  const server = http.createServer(app)
  const wss = new WebSocket.Server({ server })

  const sockets = new Set()

  wss.on('connection', ws => {
    sockets.add(ws)

    debug('client connected')

    ws.send(JSON.stringify({ greeting: { clearConsole } }))

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
