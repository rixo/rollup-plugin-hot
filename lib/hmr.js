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

const createServer = require('./server')

module.exports = (options = {}) => {
  const { hot, baseUrl = '' } = options
  const port = 38670

  if (!hot) {
    return {
      name,
      options: options => ({
        ...options,
        external: [...options.external, '@@hot'],
      }),
    }
  }

  const snippetSrc = options.clientUrl
    ? JSON.stringify(options.clientUrl)
    : `
      '//'
      + (window.location.host || 'localhost').split(':')[0]
      + ':${port}/hmr-client.js'
    `

  const clientScriptId = 'svelte-hmr-client'
  const banner = () => `
    (function(d, s) {
       if (d.getElementById('${clientScriptId}')) return;
       s = d.createElement('script');
       s.async = 1;
       s.src = ${snippetSrc};
       s.id = '${clientScriptId}';
       d.head.appendChild(s)
    })(window.document);
  `

  const server = createServer({ port })
  server.listen(port, () => {
    log(`Listening on ${port}`)
  })
  closeServerOnTermination(server)

  const changed = {}

  const isEntryChunk = chunk => chunk.isEntry

  let input

  return {
    name,
    // banner,
    watchChange(id) {
      console.log('change', id)
      changed[id] = true
    },
    options: options => {
      input = options.input
      return {
        ...options,
        treeshake: false,
        preserveModules: true,
        external: [...options.external, '@@hot'],
      }
    },
    outputOptions(options) {
      if (options.format !== 'system') {
        // console.trace()
      }
      return {
        ...options,
        format: 'system',
      }
    },
    generateBundle(outputOptions, bundle, isWrite) {
      Object.values(bundle)
        .filter(({ isEntry }) => isEntry)
        .forEach(chunk => {
          const path = chunk.fileName
          const url = baseUrl + path
          const source = `System.import(${JSON.stringify(url)})\n`
          // DEBUG proper filename for hot entrypoint
          const filename = `${chunk.name}.js`
          this.emitFile({ type: 'asset', filename, source })
        })
    },
    writeBundle(bundle) {
      const changes = Object.values(bundle)
        .filter(({ facadeModuleId: fmi }) => changed[fmi])
        .map(chunk => {
          changed[chunk.facadeModuleId] = false
          return baseUrl + chunk.fileName
        })
      server.broadcast({ changes })
    },
  }
}
