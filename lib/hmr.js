const path = require('path')

const relative = path.relative
path.relative = (from, to) => {
  if (!to) {
    console.trace()
  }
  return relative(from, to)
}

const createServer = require('./server')
const {
  log,
  debug,
  noop,
  pipe,
  posixify,
  readFile,
  runtimeFile,
  slash,
} = require('./utils')

const name = 'hmr'
const gid = '__ROLLUP_PLUGIN_HMR_RUNTIME'
const OUTPUT_OPTIONS = Symbol('outputOptions')

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

const renderRuntimeScript = importEntryPoints => `
  if (!window['${gid}']) {
    var loaded = false;
    var callbacks = [];
    window['${gid}'] = {
      then: function(cb) {
        if (loaded) {
          setTimeout(cb, 0);
        } else {
          callbacks.push(cb);
        }
      }
    };
    var script = d.createElement('script');
    script.async = 1;
    script.src = wsServerUrl + 'runtime/hmr-runtime.js';
    script.onload = () => {
      loaded = true;
      callbacks.splice(0, callbacks.length).forEach(function(cb) {
        cb();
      });
    };
    d.head.appendChild(script);
  }
  window['${gid}'].then(function() {
    ${importEntryPoints}
  });
`

const renderRuntimeInline = async initCode => `
  if (!window['${gid}']) {
    window['${gid}'] = {
      then: function(cb) {
        return cb()
      }
    };
    (function() {
      ${await readFile(runtimeFile, 'utf8')}
    })();
  }
  (function() {
    ${initCode}
  })();
`

const renderHotLoaderWrapper = ({ inlineRuntime, port }) => async initCode =>
  `(function() {
  var d = window.document
  var wsServerUrl = window.location.protocol + '//'
    + (window.location.host || 'localhost').split(':')[0]
    + ':${port}/';
  ${
    inlineRuntime
      ? await renderRuntimeInline(initCode)
      : renderRuntimeScript(initCode)
  }
})();
`

const createImportEntry = ({ inMemory, hotBundleUrl }) => ({ fileName }) => {
  const url = hotBundleUrl + fileName
  return inMemory
    ? `System.import(${JSON.stringify(url)}, wsServerUrl);`
    : `System.import(${JSON.stringify(url)});`
}

const renderEntryHotLoader = ({
  inlineRuntime, // inline HMR runtime code
  port,
  hotBundleUrl,
  inMemory,
}) =>
  pipe(
    createImportEntry({ inMemory, hotBundleUrl }),
    renderHotLoaderWrapper({ inlineRuntime, port })
  )

module.exports = (options = {}) => {
  const {
    public: publicDir = '',
    baseUrl = '/',
    inMemory = false,
    clearConsole = false,
    port = 38670,
    // --- advanced ---
    verbose: enableVerbose = false,
    loaderFile, // = outputOptions.file
    hotBundleSuffix = '@hot',
    // --- internals ---
    hotHash = '_hot_',
    write = !inMemory,
    // serving the runtime client make it easier to debug (because it will also
    // loads sourcemaps) -- defaults to !inMemory because inMemory needs to
    // serve files anyway, while otherwise the need to serve files can be
    // avoided entirely by writing the code for the hmr runtime & SystemJS
    // directly in entrypoint files
    inlineRuntimeOption = !inMemory,
  } = options

  const inlineRuntime = inlineRuntimeOption

  const verbose = enableVerbose ? debug : noop

  const changed = {}

  let initialPreserveModules = false

  // close existing instance when rollup restarts (e.g. when config changes)
  if (server) {
    server.close()
  }

  server = createServer({ port, clearConsole, inMemory })
  server.listen(port, () => {
    log(`Listening on ${port}`)
    if (inMemory) {
      log('Serving from RAM')
    }
  })
  closeServerOnTermination(server)

  const emitChanges = (hotBundleUrl, bundle) => {
    let hasChanges = false
    const changes = Object.values(bundle)
      .filter(({ facadeModuleId: fmi }) => changed[fmi])
      .map(({ fileName, url = fileName, facadeModuleId: fmi }) => {
        hasChanges = true
        changed[fmi] = false
        return hotBundleUrl + url
      })
    if (hasChanges) {
      server.broadcast({ changes })
    }
  }

  return {
    name,

    watchChange(id) {
      changed[id] = true
    },

    options: options => {
      const patched = { ...options }
      // preserveModules
      initialPreserveModules = options.preserveModules
      if (!options.preserveModules) {
        verbose('Enable preserveModules (required by HMR)')
        patched.preserveModules = true
      }
      // performance
      if (options.treeshake) {
        verbose('Disable treeshake (for performance)')
        patched.treeshake = false
      }
      return patched
    },

    outputOptions(outputOptions) {
      const { file, name, entryFileNames, ...otherOptions } = outputOptions
      if (name) {
        verbose('output.name is not supported in hot mode: ignored')
      }
      if (outputOptions.format !== 'system') {
        verbose(
          `change output.format to "system" (from "${outputOptions.format}")`
        )
      }
      const options = {
        ...otherOptions,
        format: 'system',
      }
      // [hash] is not allowed currently in Rollup with preserveModules
      if (entryFileNames) {
        options.entryFileNames = entryFileNames.replace('[hash]', hotHash)
      }
      // Example:
      //
      // pluginOptions = {
      //   public: 'public',
      //   baseUrl: '/base-url/',
      // },
      //
      if (file) {
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
        // hotBundleBaseUrl: '/base-url/'
        //
        options.dir = path.dirname(file)
        verbose(`Change output.file "${file}" to output.dir "${options.dir}"`)
        options.loaderFile = loaderFile || path.basename(file)
        options.hotBundlePath = options.loaderFile + hotBundleSuffix
        const fullBundlePath = path.join(options.dir, options.hotBundlePath)
        const bundleUrl = posixify(path.relative(publicDir, fullBundlePath))
        options.hotBundleUrl = slash(baseUrl + bundleUrl)
        options.hotBundleBaseUrl = baseUrl
      } else {
        if (initialPreserveModules) {
          // outputOptions = {
          //   dir: 'public/bundle',
          // }
          //
          // =>
          //
          // hotBundlePath: '',
          // hotBundleUrl: '/base-url/bundle/'
          // hotBundleBaseUrl: '/base-url/bundle/'
          //
          options.hotBundlePath = ''
          const bundleUrl = posixify(path.relative(publicDir, options.dir))
          options.hotBundleUrl = slash(baseUrl + bundleUrl)
          options.hotBundleBaseUrl = options.hotBundleUrl
        } else {
          // outputOptions = {
          //   dir: 'public',
          // }
          //
          // =>
          //
          // hotBundlePath: '@hot',
          // hotBundleUrl: '/base-url/@hot/'
          // hotBundleBaseUrl: '/base-url/'
          //
          const fullBundlePath = path.join(options.dir, hotBundleSuffix)
          options.hotBundlePath = path.relative(publicDir, fullBundlePath)
          const bundleUrl = posixify(options.hotBundlePath)
          options.hotBundleUrl = slash(baseUrl + bundleUrl)
        }
      }
      return options
    },

    async generateBundle(outputOptions, bundle) {
      const {
        loaderFile,
        hotBundleUrl,
        hotBundlePath,
        sourcemap,
        hotBundleBaseUrl = baseUrl,
      } = outputOptions
      // make outputOptions somehow accessible from writeBundle
      bundle[OUTPUT_OPTIONS] = outputOptions
      // render entry point imports
      const renderHotLoader = renderEntryHotLoader({
        inlineRuntime,
        port,
        inMemory,
        hotBundleUrl,
      })
      const entryLoaders = await Promise.all(
        Object.entries(bundle)
          .filter(([, chunk]) => chunk.isEntry)
          .map(async ([key, chunk]) => {
            if (initialPreserveModules) {
              // 1. move original to xxx@hot.js
              // 2. create loader targetting xxx@hot.js in place of original
              const [name, ext] = chunk.fileName.split('.')
              const hotFileName = name + hotBundleSuffix + '.' + ext
              chunk = { ...chunk, fileName: hotFileName }
              bundle[chunk.fileName] = chunk
            } else {
              bundle[key] = { ...chunk, isEntry: false }
            }
            const code = await renderHotLoader(chunk)
            // TODO multiple entrypoints + output.file
            const fileName = loaderFile || key
            return [fileName, { ...chunk, code, map: null, fileName }]
          })
      )
      // move whole bundle under @hot/ or bundle.js@hot/
      // rebase @hot bundle
      if (hotBundlePath) {
        applyBundleBasePath(hotBundlePath, bundle)
      }
      if (inMemory) {
        // write virtual files
        await server.writeBundle(hotBundleBaseUrl, bundle, { sourcemap })
        // extract changes
        emitChanges(hotBundleUrl, bundle)
      }
      // skip writing to disk
      if (!write) {
        emptyBundle(bundle)
      }
      // emit entry points (bundled with hmr runtime)
      for (const [key, chunk] of entryLoaders) {
        bundle[key] = chunk
      }
    },

    async writeBundle(bundle) {
      if (!inMemory) {
        const { hotBundleUrl } = bundle[OUTPUT_OPTIONS]
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
          if (!err.loc || !err.loc.file) {
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
