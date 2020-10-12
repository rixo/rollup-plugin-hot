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

const name = 'hot'

// keep a shared ref to server to close on rollup restart
let server

const close = () => {
  if (!server) return
  server.close()
  server = null
}

const emptyBundle = bundle => {
  for (const key of Object.keys(bundle)) {
    if (bundle[key].type === 'asset') continue
    delete bundle[key]
  }
}

const applyBundleBasePath = (basePath, bundle) => {
  for (const key of Object.keys(bundle)) {
    if (bundle[key].type === 'asset') continue
    const chunk = bundle[key]
    delete bundle[key]
    const newFileName = path.join(basePath, chunk.fileName)
    chunk.url = chunk.fileName
    chunk.fileName = newFileName
    bundle[newFileName] = chunk
  }
}

const renderLivereloadScript = async ({ initCode, ws, host, port }) => `
  const d = window.document
  const wsServerUrl = window.location.protocol
    + '//' + ${
      host != null
        ? JSON.stringify(host)
        : `(window.location.host || 'localhost').split(':')[0]`
    }
    + ':${port}/';${renderRuntimeScript(initCode, {
  host,
  port,
  ws,
  hot: false,
})}
`

const renderRuntimeScript = (
  importEntryPoints,
  { host, port, ws, hot = true }
) => `
  if (!window['${gid}']) {
    let loaded = false;
    const callbacks = [];
    window['${gid}'] = {
      host: ${JSON.stringify(host)},
      port: ${JSON.stringify(port)},
      ws: ${JSON.stringify(ws)},
      hot: ${JSON.stringify(hot)},
      then: function(cb) {
        if (loaded) {
          setTimeout(cb, 0);
        } else {
          callbacks.push(cb);
        }
      }
    };
    const script = d.createElement('script');
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

const renderRuntimeInline = async (initCode, { host, port, ws }) => `
  if (!window['${gid}']) {
    window['${gid}'] = {
      host: ${JSON.stringify(host)},
      port: ${JSON.stringify(port)},
      ws: ${JSON.stringify(ws)},
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
  ws,
}) => async initCode =>
  `(function() {
  const d = window.document
  let wsServerUrl = window.location.protocol
    + '//' + ${
      host != null
        ? JSON.stringify(host)
        : `(window.location.host || 'localhost').split(':')[0]`
    }
    + ':${port}/';
  ${
    inlineRuntime
      ? await renderRuntimeInline(initCode, { host, port, ws })
      : renderRuntimeScript(initCode, { host, port, ws })
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
  ws,
  hotBundleUrl,
  inMemory,
}) =>
  pipe(
    createImportEntry({ inMemory, hotBundleUrl }),
    renderHotLoaderWrapper({ inlineRuntime, host, port, ws })
  )

module.exports = (options = {}) => {
  const {
    enabled = true,
    hot = true,
    public: publicDir = '',
    baseUrl = '/',
    inMemory = false,
    clearConsole = false,
    cors = true,
    port: preferredPort = 33440,
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
    // --- open ---
    open = false,
    openHost = null,
    openPort = null,
    openPage = baseUrl,
    // --- advanced ---
    autoAccept = false,
    verbose: enableVerbose = false,
    loaderFile, // = outputOptions.file
    hotBundleSuffix = '@hot',
    publicHost,
    publicPort,
    useWebSocket = false,
    proxy = null,
    mount = null,
    index = null,
    fallback = null,
    serve = !!process.env.ROLLUP_WATCH,
    // --- internals ---
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
    const { appendCompatNollup } = require('rollup-plugin-hot-nollup')
    log('Compat mode: only rewrite import.meta.hot to Nollup API')
    const compatName = `${name} (compat mode: nollup)`
    return {
      name: compatName,
      options: appendCompatNollup(compatName, compatNollup),
    }
  }

  server =
    serve &&
    createServer({
      cors,
      clearConsole,
      inMemory,
      reload,
      autoAccept,
      useWebSocket,
      proxy,
      mount,
      index,
      fallback,
    })

  const portPromise =
    server &&
    server.listen(preferredPort, hmrHost, randomPortFallback).then(addr => {
      const { port: p, host } = addr
      log(`Listening on port ${p}`)
      if (inMemory) {
        log(`Serving from RAM at http://${host}:${p}`)
      }
      return addr
    })

  const getAddress = async () => portPromise

  const triggerReload = ({ reason } = {}) => {
    if (!server) return
    server.broadcast({ reload: { reason } })
  }

  if (compatModuleHot) {
    log('Compat mode: only rewrite import.meta.hot to module.hot')
    return {
      name: `${name} (compat mode: module.hot)`,
      transform(code, id) {
        if (/\.js$/.test(id)) {
          return {
            code: code.replace(
              /\bimport.meta.hot\b/g,
              'typeof module !== "undefined" && module.hot'
            ),
            map: null,
          }
        }
        return null
      },
    }
  }

  if (!hot) {
    log('Livereload mode')
    const Livereload = require('./livereload')
    return Livereload({
      triggerReload,
      renderRuntimeScript: async initCode => {
        const { host, port } = await getAddress()
        return renderLivereloadScript({
          initCode,
          host,
          port,
          ws: useWebSocket,
        })
      },
    })
  }

  const verbose = enableVerbose ? debug : noop

  const changed = {}
  const fileUrls = {}

  let initialPreserveModules = false

  const emitChanges = (hotBundleUrl, bundle) => {
    const changes = Object.values(bundle)
      .filter(({ facadeModuleId: fmi, isEntry, fileName, url = fileName }) => {
        fileUrls[fmi] = hotBundleUrl + url

        // don't emit change events for entry points because they're not
        // supposed to change during a normal HMR session (and they suffer from
        // hard to know URLs since they're served by the user's normal server)
        if (isEntry) return false
        return changed[fmi]
      })
      .map(({ fileName, url = fileName, facadeModuleId: fmi }) => {
        delete changed[fmi]
        return hotBundleUrl + url
      })

    // NOTE we need to emit deleted files because:
    //
    // 1. load foo.js
    // 2. delete foo.js
    // 3. change: foo.js <- (!) will think foo is not accepted
    //
    const forget = Object.keys(changed)
      .map(file => {
        const url = fileUrls[file]
        delete fileUrls[file]
        delete changed[file]
        return url
      })
      .filter(Boolean)

    // NOTE we must broadcast empty changesets, or the client will get stuck in
    // 'prepare' state
    server.broadcast({ changes, forget })
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

  let hotOutputOptions
  let isFirstGenerateBundle = true

  const hooks = {
    name,

    _close: close,

    _reload: triggerReload,

    watchChange(id) {
      changed[id] = true
    },

    options(options) {
      const v2 = this.meta.rollupVersion.split('.').shift() > 1
      if (!v2) {
        const { writeBundle } = hooks
        hooks.writeBundle = function(...args) {
          return writeBundle.call(this, hotOutputOptions, ...args)
        }
      }
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
      // inlineDynamicImports (not supported with preserveModules)
      if (options.inlineDynamicImports) {
        verbose('Disable inlineDynamicImports')
        options.inlineDynamicImports = false
      }
      return options
    },

    outputOptions(outputOptions) {
      const { file, dir, name, entryFileNames, ...otherOptions } = outputOptions
      const originalFormat = outputOptions.format
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
        dir,
        format: 'system',
      }
      hotOutputOptions = {}
      // [hash] is not allowed currently in Rollup with preserveModules
      if (entryFileNames) {
        // NOTE with preserveModules on, entryFileNames will be used to format
        // _every_ chunk name, not just entries propper
        delete options.entryFileNames
        hotOutputOptions.formatEntryFileName = filename =>
          entryFileNames
            .replace('[name]', filename.slice(0, -3))
            // keep [hash] as is (aligned with Nollup)
            .replace('[format]', originalFormat)
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
        hotOutputOptions.loaderFile = loaderFile || path.basename(file)
        hotOutputOptions.hotBundlePath =
          hotOutputOptions.loaderFile + hotBundleSuffix
        const fullBundlePath = path.join(
          options.dir,
          hotOutputOptions.hotBundlePath
        )
        const bundleUrl = posixify(path.relative(publicDir, fullBundlePath))
        hotOutputOptions.hotBundleUrl = slash(baseUrl + bundleUrl)
        hotOutputOptions.hotBundleBaseUrl =
          bundleUrl.indexOf('/') !== -1
            ? slash(baseUrl + path.dirname(bundleUrl))
            : baseUrl
      } else if (dir) {
        if (loaderFile) {
          throw new Error(
            'hot.loaderFile option not compatible with output.dir'
          )
        }
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
          hotOutputOptions.hotBundlePath = ''
          const bundleUrl = posixify(path.relative(publicDir, options.dir))
          hotOutputOptions.hotBundleUrl = slash(baseUrl + bundleUrl)
          hotOutputOptions.hotBundleBaseUrl = hotOutputOptions.hotBundleUrl
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
          hotOutputOptions.hotBundlePath = hotBundleSuffix
          const fullBundlePath = path.join(
            options.dir,
            hotOutputOptions.hotBundlePath
          )
          const bundleUrl = posixify(path.relative(publicDir, fullBundlePath))
          hotOutputOptions.hotBundleUrl = slash(baseUrl + bundleUrl)
          hotOutputOptions.hotBundleBaseUrl = slash(
            baseUrl + posixify(path.relative(publicDir, options.dir))
          )
        }
      }

      // make files outside of public dir accessible
      const normalize = path =>
        path
          .replace(/^(\/?)\./g, '$1~@/.')
          .replace(/\.\.\//g, '@@/')
          .replace(/\.\//g, '')

      hotOutputOptions.hotBundleUrl = normalize(hotOutputOptions.hotBundleUrl)
      hotOutputOptions.hotBundleBaseUrl = normalize(
        hotOutputOptions.hotBundleBaseUrl
      )

      return options
    },

    async generateBundle(outputOptions, bundle) {
      const { sourcemap } = outputOptions
      const {
        loaderFile,
        hotBundleUrl,
        hotBundlePath,
        hotBundleBaseUrl = baseUrl,
        formatEntryFileName,
      } = hotOutputOptions
      // render entry point imports
      // NOTE don't force detect host: it's preferable to let the client auto
      // discover it from window.location.hostname in almost any case
      // see: https://github.com/rixo/rollup-plugin-hot/pull/3#issuecomment-593114510
      const { port } = await getAddress()
      const renderHotLoader = renderEntryHotLoader({
        inlineRuntime,
        host: publicHost,
        port: publicPort || port,
        ws: useWebSocket,
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
              chunk.fileName = name + hotBundleSuffix + '.' + ext
              // chunk = { ...chunk, fileName: fileName }
              delete bundle[key]
              bundle[chunk.fileName] = { ...chunk }
            } else {
              bundle[key] = { ...chunk, isEntry: false }
            }

            // render with the real fileName of the (hot) chunk
            const code = await renderHotLoader(chunk)

            // TODO Rollup's actual entrypoint resolution is probably more
            //      complicated than that...
            // let fileName = path.resolve(dir, loaderFile || path.basename(key))
            // fileName = path.relative(dir, fileName)
            let fileName = chunk.fileName
            if (loaderFile) {
              // fileName = path.resolve(dir, loaderFile)
              fileName = loaderFile
            } else {
              fileName = path.basename(fileName)
              if (formatEntryFileName) {
                fileName = formatEntryFileName(fileName)
              }
            }

            // NOTE at this point, the in-memory reference of chunk:
            //
            // - is known by Sapper, that will use fileName as its entry point
            //
            // - is not attached to bundle anymore (chunk clones created just
            //   above will be used when actually writting the bundle to disk)
            //
            // => this means we can change the fileName of this ref to inform
            //   Sapper of the right fileName it needs to use for its entry, all
            //   while having the right hot filename in the bundle
            //
            chunk.fileName = fileName

            return [fileName, { ...chunk, code, map: null }]
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

      if (isFirstGenerateBundle) {
        isFirstGenerateBundle = false
        if (open && open !== 'none') {
          let url
          if (/https?:\/\/.+/.test(openPage)) {
            url = openPage
          } else {
            const { port: serverPort, host: serverHost } = await getAddress()
            const host =
              openHost ||
              (serverHost === '127.0.0.1' ? 'localhost' : serverHost)
            const port = openPort || serverPort
            url = `http://${host}:${port}${openPage || ''}`
          }

          await require('./open-browser')(url, open)
        }
      }
    },

    writeBundle(outputOptions, bundle) {
      if (!inMemory) {
        const { hotBundleUrl } = hotOutputOptions
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

  if (process.env.NODE_ENV === 'test') {
    hooks._publicDir = publicDir
  }

  return hooks
}
