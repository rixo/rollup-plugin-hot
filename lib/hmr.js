import WebSocket from 'ws'
import express from 'express'
import http from 'http'

const name = 'hmr'

const log = (...args) => console.log('[HMR]', ...args)
const debug = (...args) => console.debug('[HMR]', ...args)

const closeServerOnTermination = server => {
  var terminationSignals = ['SIGINT', 'SIGTERM']
  terminationSignals.forEach(signal => {
    process.on(signal, function() {
      server.close()
      process.exit()
    })
  })
}

const createServer = ({ port }) => {
  const app = express()

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

export default (options = {}) => {
  const { baseBundleUrl = '/bundle/', getUrl } = options
  const port = 38670
  const snippetSrc = options.clientUrl
    ? JSON.stringify(options.clientUrl)
    : `
      '//'
      + (window.location.host || 'localhost').split(':')[0]
      + ':${port}/hmr-client.js'
    `

  const clientScriptId = 'svelte-hmr-client'
  const banner = () => `
    (function(l, r) {
       if (l.getElementById('${clientScriptId}')) return;
       r = l.createElement('script');
       r.async = 1;
       r.src = ${snippetSrc};
       r.id = '${clientScriptId}';
       l.head.appendChild(r)
    })(window.document);
  `

  function transformHotImport(code, id) {
    // TODO ast?
    const replaced = code.replace(
      /(\bimport\b.*\bfrom\b\s+['"])@@hot(['"])/,
      `$1hot://${id}$2`
    )
    return { code: replaced, map: null }
  }

  const resolveId = source => {
    if (source.substr(0, 6) === 'hot://') {
      return { id: source }
    }
    return null
  }

  function load(id) {
    if (id.substr(0, 6) === 'hot://') {
      const clientId = getUrl(id.substr(6))
      return `
        const id = System.resolve(${JSON.stringify(clientId)})
        const accept = cb => System.__hot.accept(id, cb)
        const dispose = cb => System.__hot.dispose(id, cb)
        export default { accept, dispose }
      `
    }
    return null
  }

  const server = createServer({ port })
  server.listen(port, () => {
    log(`Listening on ${port}`)
  })
  closeServerOnTermination(server)

  const changed = {}

  return {
    name,
    transform: transformHotImport,
    resolveId,
    load,
    // banner,
    // transform(code) {
    //   console.log(code)
    // },
    // renderChunk(code, chunk, options) {
    //   // return ["import module from '@@hot'"]
    //   // console.log(code, chunk)
    // },
    watchChange(id) {
      console.log('change', id)
      changed[id] = true
    },
    // generateBundle(options, bundle, isWrite) {
    //   const { format, dir } = options
    //   if (format !== 'system') throw new Error('Unsupported')
    //   Object.values(bundle).forEach(chunk => {
    //     chunk.outputFileName =
    //   })
    //   console.log('generateBundle', options, isWrite)
    // },
    writeBundle(bundle) {
      // console.log(Object.keys(bundle))
      const changes = Object.values(bundle)
        .filter(({ facadeModuleId: fmi }) => changed[fmi])
        .map(chunk => {
          changed[chunk.facadeModuleId] = false
          // console.log(chunk)
          return baseBundleUrl + chunk.fileName
        })
      console.log(changes)
      server.broadcast({ changes })
    },
  }
}
