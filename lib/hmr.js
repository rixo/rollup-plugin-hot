const path = require('path')
const fs = require('fs')

const createServer = require('./server')
const { log } = require('./utils')

const name = 'hmr'
const BASE_URL = Symbol('BASE_URL')

const closeServerOnTermination = server => {
  const terminationSignals = ['SIGINT', 'SIGTERM']
  terminationSignals.forEach(signal => {
    process.on(signal, function() {
      server.close()
      process.exit()
    })
  })
}

module.exports = (options = {}) => {
  const {
    hot,
    baseUrl = '/',
    public: publicDir = '.',
    hotBundleSuffix = '@hot',
    port = 38670,
    loaderFile,
    clearConsole = false,
  } = options

  if (!hot) {
    return {
      name,
      options: options => ({
        ...options,
        external: [...options.external, '@hot'],
      }),
    }
  }

  const snippetSrc = options.clientUrl
    ? JSON.stringify(options.clientUrl)
    : `
      '//'
      + (window.location.host || 'localhost').split(':')[0]
      + ':${port}/runtime/hmr-client.js'
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

  const server = createServer({ port, clearConsole })
  server.listen(port, () => {
    log(`Listening on ${port}`)
  })
  closeServerOnTermination(server)

  const changed = {}

  // Writes a loader with `System.import(...)` for each entry point
  const writeEntriesLoader = async (outputOptions, bundle) => {
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
      external: [...options.external, '@hot'],
    }),

    outputOptions({ file, name, ...otherOptions }) {
      if (name) {
        log('output.name is not supported in hot mode: ignored')
      }
      const options = {
        ...otherOptions,
        format: 'system',
      }
      if (file) {
        options.dir = file + hotBundleSuffix
        options.loaderFile = loaderFile || file
        const rel = path.relative(publicDir, options.loaderFile)
        options.bundleBaseUrl = `${baseUrl}${rel}${hotBundleSuffix}`
      } else {
        if (!loaderFile) {
          throw new Error('You must specify loaderFile with output.dir')
        }
        options.loaderFile = loaderFile
        const rel = path.relative(publicDir, options.dir)
        options.bundleBaseUrl = baseUrl + rel
      }
      return options
    },

    // FIXME
    //
    // This is a dirty workaround because I didn't find how to access SystemJS'
    // own `import.meta` in a module wrapped by Rollup.
    //
    // Rollup replaces this:
    //
    //   import.meta.accept(...)
    //
    // By this:
    //
    //   module.meta.accept(...)
    //
    // But, it seems that `module` is added in scope only if there is a
    // dynamic import in the module.
    //
    // So here, we're ensuring `module` is always present. The monkey patched
    // code is here:
    //
    // https://github.com/rollup/rollup/blob/4fd918fc8b7925471e00bd947191d850dea21ca5/src/finalisers/system.ts#L167
    //
    renderChunk(code) {
      if (/\bmodule\.meta\b/.test(code)) {
        const patched = code.replace(
          /(System\.register\(\[.*\],\s*function(\s*)\()[^)]*\)/,
          `$1exports,$2module)`
        )
        return { code: patched, map: null }
      }
      return null
    },

    async generateBundle(outputOptions, bundle, isWrite) {
      bundle[BASE_URL] = outputOptions.bundleBaseUrl
      if (isWrite) {
        await writeEntriesLoader(outputOptions, bundle, isWrite)
      }
    },

    writeBundle(bundle) {
      const bundleBaseUrl = bundle[BASE_URL]
      const changes = Object.values(bundle)
        .filter(({ facadeModuleId: fmi }) => changed[fmi])
        .map(({ fileName, facadeModuleId: fmi }) => {
          changed[fmi] = false
          return `${bundleBaseUrl}/${fileName}`
        })
      server.broadcast({ changes })
    },

    buildStart() {
      server.broadcast({ status: 'prepare' })
    },

    buildEnd(err) {
      if (err) {
        const formatBuildError = err => {
          const { loc } = err
          return [
            `Error: ${err.message}`,
            `${path.relative(process.cwd(), loc.file)} (${loc.line}:${
              loc.column
            })`,
            err.frame,
          ].join('\n\n')
        }
        const error = { ...err, formatted: formatBuildError(err) }
        const build = error
        const errors = [error]
        server.broadcast({ errors: { errors, build } })
      }
    },
  }
}
