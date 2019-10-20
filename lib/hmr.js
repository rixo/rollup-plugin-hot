const path = require('path')

const createServer = require('./server')
const { log, posixify, runtimeFile, readFile } = require('./utils')

const name = 'hmr'
const bundlesOutputOptions = new WeakMap()

// keep a shared ref to server to close on rollup restart
let server

const closeServerOnTermination = server => {
  const terminationSignals = ['SIGINT', 'SIGTERM']
  terminationSignals.forEach(signal => {
    process.on(signal, function() {
      server.close()
      process.exit()
    })
  })
}

const emptyBundle = bundle => {
  for (const key of Object.keys(bundle)) {
    delete bundle[key]
  }
}

const applyBundleBasePath = (basePath, bundle) => {
  for (const key of Object.keys(bundle)) {
    const chunk = bundle[key]
    delete bundle[key]
    const newFileName = path.join(basePath, chunk.fileName)
    chunk.url = chunk.fileName
    chunk.fileName = newFileName
    bundle[newFileName] = chunk
  }
}

const renderRuntimeLoad = importEntryPoints => `
  var script = d.createElement('script');
  script.async = 1;
  script.src = wsServerUrl + 'runtime/hmr-runtime.js';
  script.onload = () => {
    ${importEntryPoints}
  };
  d.head.appendChild(script);
`

const renderRuntimeInline = async importEntryPoints => `
  (function() {
    ${await readFile(runtimeFile, 'utf8')}
  })();
  ${importEntryPoints}
`

const doRenderHotLoader = async ({ serveRuntime, port, importEntryPoints }) => `
(function() {
  var d = window.document
  var wsServerUrl = window.location.protocol + '//'
    + (window.location.host || 'localhost').split(':')[0]
    + ':${port}/';
  ${
    serveRuntime
      ? renderRuntimeLoad(importEntryPoints)
      : await renderRuntimeInline(importEntryPoints)
  }
})();
`

// Writes a loader with `System.import(...)` for each entry point
const renderHotLoader = async (
  bundle,
  { hotBundleUrl, inMemory, port, serveRuntime }
) => {
  const importEntryPoints = Object.values(bundle)
    .filter(({ isEntry }) => isEntry)
    .map(chunk => {
      const filename = chunk.fileName
      const url = hotBundleUrl + filename
      return inMemory
        ? `System.import(${JSON.stringify(url)}, wsServerUrl);`
        : `System.import(${JSON.stringify(url)});`
    })
    .join('\n')
  return await doRenderHotLoader({ serveRuntime, port, importEntryPoints })
}

module.exports = (options = {}) => {
  const {
    baseUrl = '/',
    public: publicDir = '',
    hotBundleSuffix = '@hot',
    port = 38670,
    loaderFile, // = outputOptions.file
    clearConsole = false,
    inMemory = true,
    // serving the runtime client make it easier to debug (because it will also
    // loads sourcemaps) -- defaults to inMemory because inMemory needs to serve
    // files anyway, otherwise the need to serve files can be avoided entirely
    // by writing all needed code in the bundle hot loader file
    serveRuntime = !!inMemory,
  } = options

  // close existing instance when rollup restarts (e.g. when config changes)
  if (server) {
    server.close()
  }

  server = createServer({ port, clearConsole, inMemory })
  server.listen(port, () => {
    log(`Listening on ${port}`)
  })
  closeServerOnTermination(server)

  const changed = {}

  const emitChanges = (hotBundleUrl, bundle) => {
    const changes = Object.values(bundle)
      .filter(({ facadeModuleId: fmi }) => changed[fmi])
      .map(({ fileName, url = fileName, facadeModuleId: fmi }) => {
        changed[fmi] = false
        return hotBundleUrl + url
      })
    server.broadcast({ changes })
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
    }),

    outputOptions(outputOptions) {
      const { file, name, ...otherOptions } = outputOptions
      if (name) {
        log('output.name is not supported in hot mode: ignored')
      }
      const options = {
        ...otherOptions,
        format: 'system',
      }
      if (file) {
        // Example:
        //
        // pluginOptions = {
        //   public: 'public',
        //   baseUrl: '/base-url/',
        // },
        //
        // outputOptions = {
        //   file: 'public/bundle.js',
        // }
        //
        // =>
        //
        // dir: 'public',
        // loaderFile: 'bundle.js',
        // hotBundlePath: 'bundle.js@hot',
        // hotBundleUrl: '/base-url/bundle.js@hot/',
        //
        options.dir = path.dirname(file)
        options.loaderFile = loaderFile || path.basename(file)
        options.hotBundlePath = options.loaderFile + hotBundleSuffix
        const bundleUrl = posixify(
          path.relative(
            publicDir,
            path.join(options.dir, options.hotBundlePath)
          )
        )
        options.hotBundleUrl = baseUrl + bundleUrl + '/'
      } else {
        throw new Error('TODO') // TODO
      }
      return options
    },

    async generateBundle(outputOptions, bundle, isWrite) {
      const { hotBundleUrl, hotBundlePath, sourcemap } = outputOptions
      // generate loader from bundle
      const hotLoaderSource = await renderHotLoader(bundle, {
        hotBundleUrl,
        inMemory,
        port,
        serveRuntime,
      })
      // write virtual files
      if (inMemory) {
        await server.writeBundle(hotBundleUrl, bundle, { sourcemap })
        // extract changes
        emitChanges(hotBundleUrl, bundle)
        // skip writing to disk
        if (isWrite) {
          emptyBundle(bundle)
        }
      } else {
        // make outputOptions somehow accessible from writeBundle
        bundlesOutputOptions.set(bundle, outputOptions)
        applyBundleBasePath(hotBundlePath, bundle)
      }
      // emit hmr loader
      this.emitFile({
        type: 'asset',
        fileName: outputOptions.loaderFile,
        source: hotLoaderSource,
      })
    },

    writeBundle(bundle) {
      if (!inMemory) {
        const { hotBundleUrl } = bundlesOutputOptions.get(bundle)
        emitChanges(hotBundleUrl, bundle)
      }
    },

    buildStart() {
      server.broadcast({ status: 'prepare' })
    },

    buildEnd(err) {
      if (err) {
        const formatBuildError = err => {
          if (!err) {
            return err
          }
          if (!err.loc) {
            return String(err.stack || err)
          }
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
