const path = require('path')
const fs = require('fs')

const name = 'hmr'
const BASE_URL = Symbol('BASE_URL')

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
  const {
    hot,
    baseUrl = '/',
    public = '.',
    hotBundleSuffix = '@hot',
    port = 38670,
    loaderFile,
  } = options

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
  const loaderScript = onload => `
    (function(d, s) {
       if (d.getElementById('${clientScriptId}')) {
         ${onload}
       } else {
         s = d.createElement('script');
         s.async = 1;
         s.src = ${snippetSrc};
         s.id = '${clientScriptId}';
         s.onload = () => {
           ${onload}
         }
         d.head.appendChild(s)
       }
    })(window.document);
  `

  const server = createServer({ port })
  server.listen(port, () => {
    log(`Listening on ${port}`)
  })
  closeServerOnTermination(server)

  const changed = {}

  const isEntryChunk = chunk => chunk.isEntry

  // Writes a loader with `System.import(...)` for each entry point
  const writeEntriesLoader = async (outputOptions, bundle, isWrite) => {
    const bundleBaseUrl = bundle[BASE_URL]
    const imports = Object.values(bundle)
      .filter(({ isEntry }) => isEntry)
      .map(chunk => {
        const filename = chunk.fileName
        const url = `${bundleBaseUrl}/${filename}`
        chunk.hotUrl = url
        return `System.import(${JSON.stringify(url)});`
      })
    const source = loaderScript(imports.join('\n'))
    await new Promise((resolve, reject) => {
      fs.writeFile(outputOptions.loaderFile, source, 'utf8', err => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  return {
    name,
    watchChange(id) {
      changed[id] = true
    },
    options: options => ({
      ...options,
      treeshake: false,
      preserveModules: true,
      external: [...options.external, '@@hot'],
    }),
    outputOptions({ file, format, name, ...otherOptions }) {
      if (name) {
        console.log('output.name is not supported in hot mode: ignored')
      }
      const options = {
        ...otherOptions,
        format: 'system',
      }
      if (file) {
        options.dir = file + hotBundleSuffix
        options.loaderFile = loaderFile || file
        const rel = path.relative(public, options.loaderFile)
        options.bundleBaseUrl = `${baseUrl}${rel}${hotBundleSuffix}`
      } else {
        if (!loaderFile) {
          throw new Error('You must specify loaderFile with output.dir')
        }
        options.loaderFile = loaderFile
        const rel = path.relative(public, options.dir)
        options.bundleBaseUrl = baseUrl + rel
      }
      return options
    },
    async generateBundle(outputOptions, bundle, isWrite) {
      const rel = path.relative(public, outputOptions.loaderFile)
      bundle[BASE_URL] = outputOptions.bundleBaseUrl
      if (isWrite) {
        await writeEntriesLoader(outputOptions, bundle, isWrite)
      }
    },
    writeBundle(bundle) {
      const bundleBaseUrl = bundle[BASE_URL]
      const changes = Object.entries(bundle)
        .filter(([, { facadeModuleId: fmi }]) => changed[fmi])
        .map(([filename, { fileName, facadeModuleId: fmi }]) => {
          changed[fmi] = false
          return `${bundleBaseUrl}/${fileName}`
        })
      server.broadcast({ changes })
    },
  }
}
