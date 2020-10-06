const path = require('path')
const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const cors = require('cors')
const { isIP } = require('net')
const mime = require('mime-types')

const { debug, posixify, distUrl, runtimeDir } = require('./utils')

// this looks ridiculous, but it prevents sourcemap tooling from mistaking
// this for an actual sourceMappingURL
let SOURCEMAPPING_URL = 'sourceMa'
SOURCEMAPPING_URL += 'ppingURL'

const defaultIndexFile = 'index.html'

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

const createProxyHandler = (base, target) => {
  const expressProxy = require('express-http-proxy')

  if (Array.isArray(target)) {
    return expressProxy(...target)
  }

  if (typeof target === 'string') {
    const { pathname } = new URL(target)

    // express-http-proxy does not forward any path

    // Propagate sub-paths
    // "/a": "http://localhost"
    // - /a => http://localhost
    // - /a/b => http://localhost/b

    // "/a": "http://localhost/x"
    // - /a => http://localhost/x
    // - /a/b => http://localhost/x/b

    // "/a": "http://localhost/y/"
    // - /a => http://localhost/y/
    // - /a/b => http://localhost/y/b
    return expressProxy(target, {
      proxyReqPathResolver({ url }) {
        // This prevents the addition of a single slash
        // in case the target does not end with a slash
        //
        // "/a": "http://localhost/b"
        // '/a' => '/b/' but we want to just '/b'
        if (url === '/') return pathname

        // Add additional path to target and
        // prevent double slash as url always starts with one
        return pathname + (pathname.endsWith('/') ? url.slice(1) : url)
      },
    })
  }

  return expressProxy(target)
}

const createServer = ({
  clearConsole,
  inMemory = false,
  reload,
  autoAccept,
  cors: corsOption = true,
  useWebSocket = false,
  proxy,
  mount,
  index,
  fallback,
}) => {
  const app = express()

  if (corsOption) {
    app.use(cors({ ...corsOption }))
  }

  app.use(distUrl, express.static(runtimeDir))

  const sockets = new Set()

  const server = http.createServer(app)

  const sendGreeting = client => {
    client.send(
      JSON.stringify({
        greeting: { clearConsole, inMemory, reload, autoAccept },
      })
    )
  }

  if (useWebSocket) {
    const wss = new WebSocket.Server({ server })

    wss.on('connection', ws => {
      sockets.add(ws)

      debug('client connected')

      sendGreeting()

      ws.on('close', () => {
        debug('client disconnected')
        sockets.delete(ws)
      })
    })
  }
  // else: SSE
  else {
    // https://tomkersten.com/articles/server-sent-events-with-node/
    app.get('/~hot', (req, res) => {
      // let request last as long as possible
      req.socket.setTimeout(0)

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write('\n')

      // let id = 0

      const client = {
        send(data) {
          // id++ // Increment our message count
          // res.write('id: ' + id + '\n')
          res.write('data: ' + data + '\n\n') // Note the extra newline
        },
      }

      sockets.add(client)

      sendGreeting(client)

      req.on('close', function() {
        debug('client disconnected')
        sockets.delete(client)
      })
    })
  }

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
        const headers = {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        }
        // NOTE Firefox needs correct mime type to execute js
        const defaultContentType = 'text/javascript'
        try {
          headers['Content-Type'] = mime.lookup(key) || defaultContentType
        } catch (err) {
          // hmm... maybe not wise?
          // problematic case: virtual modules (with no .js extension) are
          // failing in Rollup
          headers['Content-Type'] = defaultContentType
        }
        res.set(headers).send(mod)
      } else {
        next()
      }
    })
  }

  if (proxy) {
    for (const [base, target] of Object.entries(proxy)) {
      app.use(base, createProxyHandler(base, target))
    }
  }

  if (mount) {
    for (const [target, base] of Object.entries(mount)) {
      app.use(base, express.static(path.resolve(target)))
    }
  }

  if (index) {
    const filename = index === true ? defaultIndexFile : index
    const file = path.resolve(filename)
    app.get(['/', '/index.html', '/index'], (req, res) => {
      res.sendFile(file)
    })
  }

  if (fallback) {
    const filename =
      typeof fallback === 'string'
        ? fallback
        : typeof index === 'string'
        ? index
        : defaultIndexFile
    const file = path.resolve(filename)
    app.get('*', (req, res, next) => {
      if (req.accepts('html')) {
        res.sendFile(file)
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
