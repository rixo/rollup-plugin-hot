const path = require('path')

const createServer = require('./server')
const { log, pipe, posixify, readFile, runtimeFile } = require('./utils')

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

const renderRuntimeLoad = importEntryPoints => `
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
    (function() {
      ${await readFile(runtimeFile, 'utf8')}
    })();
    loaded = true;
    callbacks.splice(0, callbacks.length).forEach(function(cb) {
      cb();
    });
  }
  window['${gid}'].then(function() {
    ${initCode}
  });
`

const renderHotLoaderWrapper = ({ serveRuntime, port }) => async initCode => `
(function() {
  var d = window.document
  var wsServerUrl = window.location.protocol + '//'
    + (window.location.host || 'localhost').split(':')[0]
    + ':${port}/';
  ${
    serveRuntime
      ? renderRuntimeLoad(initCode)
      : await renderRuntimeInline(initCode)
  }
})();
`

const createImportEntry = ({ inMemory, hotBundleUrl }) => chunk => {
  const filename = chunk.fileName
  const url = hotBundleUrl + filename
  return inMemory
    ? `System.import(${JSON.stringify(url)}, wsServerUrl);`
    : `System.import(${JSON.stringify(url)});`
}

const renderEntryHotLoader = ({ serveRuntime, port, hotBundleUrl, inMemory }) =>
  pipe(
    createImportEntry({ inMemory, hotBundleUrl }),
    renderHotLoaderWrapper({ serveRuntime, port })
  )

module.exports = (options = {}) => {
  const {
    public: publicDir = '',
    baseUrl = '/',
    inMemory = false,
    clearConsole = false,
    port = 38670,
    // --- advanced ---
    loaderFile, // = outputOptions.file
    hotBundleSuffix = '@hot',
    // --- internals ---
    hotHash = '🔥',
    write = !inMemory,
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
      // TODO if initially preserveModule is true, then we should probably find
      //      a way not to move everything under @hot/
      initialPreserveModules: options.preserveModules,
      preserveModules: true,
    }),

    outputOptions(outputOptions) {
      const { file, name, entryFileNames, ...otherOptions } = outputOptions
      if (name) {
        log('output.name is not supported in hot mode: ignored')
      }
      const options = {
        ...otherOptions,
        format: 'system',
      }
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
        // outputOptions = {
        //   dir: 'public',
        // }
        //
        // =>
        //
        // hotBundlePath: 'public/@hot',
        // hotBundleUrl: '/base-url/@hot/'
        //
        options.hotBundlePath = hotBundleSuffix
        const bundleUrl = posixify(
          path.relative(
            publicDir,
            path.join(options.dir, options.hotBundlePath)
          )
        )
        options.hotBundleUrl = baseUrl + bundleUrl + '/'
      }
      return options
    },

    async generateBundle(outputOptions, bundle) {
      const {
        loaderFile,
        hotBundleUrl,
        hotBundlePath,
        sourcemap,
      } = outputOptions
      // make outputOptions somehow accessible from writeBundle
      bundle[OUTPUT_OPTIONS] = outputOptions
      // render entry point imports
      const renderHotLoader = renderEntryHotLoader({
        serveRuntime,
        port,
        inMemory,
        hotBundleUrl,
      })
      const entryLoaders = await Promise.all(
        Object.entries(bundle)
          .filter(([, chunk]) => chunk.isEntry)
          .map(async ([key, chunk]) => {
            const code = await renderHotLoader(chunk)
            bundle[key] = { ...chunk, isEntry: false }
            // TODO multiple entrypoints + output.file
            const fileName = loaderFile || key
            return [fileName, { ...chunk, code, fileName }]
          })
      )
      // move whole bundle under @hot/ or bundle.js@hot/
      // rebase @hot bundle
      if (hotBundlePath) {
        applyBundleBasePath(hotBundlePath, bundle)
      }
      if (inMemory) {
        // write virtual files
        await server.writeBundle(baseUrl, bundle, { sourcemap })
        // extract changes
        emitChanges(hotBundleUrl, bundle)
      } else {
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
    // renderChunk(code) {
    //   if (/\bmodule\.meta\b/.test(code)) {
    //     const patched = code.replace(
    //       /(System\.register\(\[.*\],\s*function(\s*)\()[^)]*\)/,
    //       `$1exports,$2module)`
    //     )
    //     return { code: patched, map: null }
    //   }
    //   return null
    // },
  }
}
