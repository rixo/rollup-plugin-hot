const path = require('path')

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
const { gid } = require('./constants')
const { appendCompatNollup } = require('./compat-nollup')

const name = 'hot'
const OUTPUT_OPTIONS = Symbol('outputOptions')

// keep a shared ref to server to close on rollup restart
let server

const close = () => {
  if (!server) return
  server.close()
  server = null
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

const renderRuntimeScript = (importEntryPoints, { host, port }) => `
  if (!window['${gid}']) {
    var loaded = false;
    var callbacks = [];
    window['${gid}'] = {
      host: ${JSON.stringify(host)},
      port: ${JSON.stringify(port)},
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

const renderRuntimeInline = async (initCode, { host, port }) => `
  if (!window['${gid}']) {
    window['${gid}'] = {
      host: ${JSON.stringify(host)},
      port: ${JSON.stringify(port)},
      then: function(cb) { return cb(); }
    };
    (function() {
      ${await readFile(runtimeFile, 'utf8')}
    })();
  }
  (function() {
    ${initCode}
  })();
`

const renderHotLoaderWrapper = ({
  inlineRuntime,
  host,
  port,
}) => async initCode =>
  `(function() {
  var d = window.document
  var wsServerUrl = window.location.protocol
    + '//' + ${
      host != null
        ? JSON.stringify(host)
        : `(window.location.host || 'localhost').split(':')[0]`
    }
    + ':${port}/';
  ${
    inlineRuntime
      ? await renderRuntimeInline(initCode, { host, port })
      : renderRuntimeScript(initCode, { host, port })
  }
})();
`

const createImportEntry = ({ inMemory, hotBundleUrl }) => ({ fileName }) => {
  const url = hotBundleUrl + fileName
  const catcher = `.catch(err => {
    console.error(err && err.stack || err);
  })`
  return inMemory
    ? `System.import(${JSON.stringify(url)}, wsServerUrl)${catcher};`
    : `System.import(${JSON.stringify(url)})${catcher};`
}

const renderEntryHotLoader = ({
  inlineRuntime, // inline HMR runtime code
  host = null,
  port,
  hotBundleUrl,
  inMemory,
}) =>
  pipe(
    createImportEntry({ inMemory, hotBundleUrl }),
    renderHotLoaderWrapper({ inlineRuntime, host, port })
  )

module.exports = (options = {}) => {
  const {
    enabled = true,
    public: publicDir = '',
    baseUrl = '/',
    inMemory = false,
    clearConsole = false,
    cors = true,
    port: preferredPort = 38670,
    host: hmrHost = 'localhost',
    randomPortFallback = true,
    reload = true,
    // --- compat modes / options ---
    // replaces import.meta.hot with module.hot, does nothing else
    compatModuleHot = false,
    // replaces module.hot with import.meta
    rewriteModuleHot = false,
    // rewrites import.meta.hot to Nollup API
    compatNollup = !!process.env.NOLLUP,
    // --- advanced ---
    autoAccept = false,
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
    inlineRuntime = !inMemory,
  } = options

  // close existing instance when rollup restarts (e.g. when config changes)
  close()

  if (!enabled) {
    log('Disabled: will do nothing')
    return {
      name: `${name} (disabled)`,
    }
  }

  if (compatNollup) {
    log('Compat mode: only rewrite import.meta.hot to Nollup API')
    const compatName = `${name} (compat mode: nollup)`
    return {
      name: compatName,
      options: appendCompatNollup(compatName, compatNollup),
    }
  }

  if (compatModuleHot) {
    log('Compat mode: only rewrite import.meta.hot to module.hot')
    return {
      name: `${name} (compat mode: module.hot)`,
      transform(code, id) {
        if (/\.js$/.test(id)) {
          return {
            code: code.replace(/\bimport.meta.hot\b/g, 'module.hot'),
            map: null,
          }
        }
        return null
      },
    }
  }

  const verbose = enableVerbose ? debug : noop

  const changed = {}

  let initialPreserveModules = false

  server = createServer({
    cors,
    clearConsole,
    inMemory,
    reload,
    autoAccept,
  })

  const portPromise = server
    .listen(preferredPort, hmrHost, randomPortFallback)
    .then(addr => {
      const { port: p, host } = addr
      log(`Listening on port ${p}`)
      if (inMemory) {
        log(`Serving from RAM at http://${host}:${p}`)
      }
      return addr
    })

  const getAddress = async () => portPromise

  const emitChanges = (hotBundleUrl, bundle) => {
    let hasChanges = false
    const changes = Object.values(bundle)
      .filter(({ facadeModuleId: fmi, isEntry }) => {
        // don't emit change events for entry points because they're not
        // supposed to change during a normal HMR session (and they suffer from
        // hard to know URLs since they're served by the user's normal server)
        if (isEntry) return false
        return changed[fmi]
      })
      .map(({ fileName, url = fileName, facadeModuleId: fmi }) => {
        hasChanges = true
        delete changed[fmi]
        return hotBundleUrl + url
      })
    if (hasChanges) {
      server.broadcast({ changes })
    }
  }

  const formatBuildError = err => {
    if (!err) {
      return err
    }
    if (err.frame) {
      const name = err.name || 'Error'
      if (err.loc && err.loc.file) {
        const {
          loc: { file, line, column },
        } = err
        return [
          `${name}: ${err.message}`,
          `${path.relative(process.cwd(), file)} (${line}:${column})`,
          err.frame,
        ].join('\n\n')
      }
      if (err.filename && err.start) {
        const {
          start: { line, column },
          filename: file,
        } = err
        return [
          `${name}: ${err.message}`,
          `${path.relative(process.cwd(), file)} (${line}:${column})`,
          err.frame,
        ].join('\n\n')
      }
    }
    return String(err.stack || err)
  }

  const hooks = {
    name,

    _close: close,

    watchChange(id) {
      changed[id] = true
    },

    options: options => {
      // preserveModules
      initialPreserveModules = options.preserveModules
      if (!options.preserveModules) {
        verbose('Enable preserveModules')
        options.preserveModules = true
      }
      // with treeshaking a generated module contents can change even if the
      // module's code dont change (thus don't trigger watchChange), because
      // some of its exports might get treeshaked when _importers_ change
      if (options.treeshake !== false) {
        verbose('Disable treeshake')
        options.treeshake = false
      }
      return options
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
          options.hotBundlePath = hotBundleSuffix
          const fullBundlePath = path.join(options.dir, options.hotBundlePath)
          const bundleUrl = posixify(path.relative(publicDir, fullBundlePath))
          options.hotBundleUrl = slash(baseUrl + bundleUrl)
          options.hotBundleBaseUrl = slash(
            baseUrl + posixify(path.relative(publicDir, options.dir))
          )
          if (loaderFile) {
            options.loaderFile = loaderFile
          }
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
      const { host, port } = await getAddress()
      const renderHotLoader = renderEntryHotLoader({
        inlineRuntime,
        host,
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
        const error = { ...err, formatted: formatBuildError(err) }
        const build = error
        const errors = [error]
        server.broadcast({ errors: { errors, build } })
      }
    },
  }

  if (rewriteModuleHot) {
    hooks.transform = function transform(code, id) {
      if (/\.js$/.test(id)) {
        return {
          code: code.replace(/\bmodule.hot\b/g, 'import.meta.hot'),
          map: null,
        }
      }
      return null
    }
  }

  return hooks
}
