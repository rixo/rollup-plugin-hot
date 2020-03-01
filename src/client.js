import ErrorOverlay from './overlay'

import * as log from './log'
import { applyUpdate, flush } from './hot'

export default ({
  ws: useWebSocket,
  host,
  port = 38670,
  reload: reloadOption = true,
}) => {
  const autoAccept = true

  const reloadOn = reloadOption
    ? {
        acceptError: true,
        moduleError: 'defer',
        error: true,
        ...reloadOption,
      }
    : false

  let deferredFullReload = false

  const resolveHost = () => {
    const match = /^([^.]+)(.*\.codesandbox\.io)$/.exec(location.hostname)
    if (match) {
      return `${match[1]}-${port}${match[2]}`
    }
    return `${host && host != '0.0.0.0' ? host : location.hostname}:${port}`
  }

  const wsUrl = resolveHost()

  let clearConsole = false
  let rootUrl

  const overlay = ErrorOverlay()

  const unresolve = id => {
    const baseUrl = rootUrl || location.origin + '/'
    const pre = String(id).slice(0, baseUrl.length)
    if (pre === baseUrl) {
      return String(id).slice(baseUrl.length)
    } else {
      return id
    }
  }

  const doReload = () => window.location.reload()

  const doFullReload = (flag, msg) => {
    if (flag === 'defer') {
      deferredFullReload = true
      const action = 'full reload on next update'
      log.log(`${msg}: ${action}`)
      return false
    } else if (flag) {
      if (deferredFullReload) {
        // deferred reload takes precedence because the rationale is that there
        // is still something broken in user's code and reloading now would just
        // throw the same error again (nominal case of deferred reload is when
        // a module body cannot be executed)
        const action = 'full reload already scheduled on next update'
        log.log(`${msg}: ${action}`)
        return false
      } else {
        const action = 'full reload'
        // yes, the log message is only visible with something like "preserve log"
        log.log(`${msg}: ${action}`)
        doReload()
        return true
      }
    } else {
      const action = 'full reload required'
      log.log(`${msg}: ${action}`)
      return false
    }
  }

  const reloadUnaccepted = msg => doFullReload(reloadOn.unaccepted, msg)
  const reloadModule = msg => doFullReload(reloadOn.moduleError, msg)
  const reloadAccept = msg => doFullReload(reloadOn.acceptError, msg)
  const reloadError = msg => doFullReload(reloadOn.error, msg)

  const applyOptions = opts => {
    clearConsole = opts.clearConsole

    // The entrypoints will use the address of the user's HTTP server (e.g.
    // localhost), because they're always written to disk where the user expects
    // them to be, and so they're served by the user controlled server.
    //
    // @hot files will either be served by the same server, OR the WS server
    // in-memory file server (e.g. 127.0.0.1)
    //
    // Host name for the user's HTTP server is determined from the URL the user
    // has typed in their address bar (e.g. localhost).
    //
    // Host name of the WS server can be known precisely since, contrary to the
    // user's server, we control it. The host name is determined automatically
    // with `getAddress` and is most likely the IP (e.g. 127.0.0.1, even if the
    // user will more probably type 'localhost').
    //
    // Theoretically, the entrypoint files can never change during a normal HMR
    // session. They're just wrappers to inject HMR runtime and point to the
    // actual module under in the @hot files.
    //
    // Module ids in updates are relative to the domain root.
    //
    // In conclusion: we need to resolve module ids from the WS server base URL
    // if and only if files are served from memory (i.e. WS server).
    //
    if (opts.inMemory) {
      rootUrl = `${location.protocol}//${wsUrl}/`
    }

    if (opts.reload === false) {
      Object.keys(reloadOn).forEach(key => {
        reloadOn[key] = false
      })
    } else {
      Object.assign(reloadOn, opts.reload)
    }
  }

  const applyAccepted = async accepted => {
    if (!accepted) {
      if (autoAccept) {
        log.verbose(
          'Update has not been accepted: hot reloading all the things'
        )
      } else {
        reloadUnaccepted('Update has not been accepted')
        return
      }
    }

    const { errors } = await flush()

    overlay.setCompileError(null)
    overlay.clearErrors()

    if (clearConsole) {
      log.clear()
    }

    if (errors) {
      // error(s) on sync run of module body
      if (errors.module) {
        for (const { id, error } of errors.module) {
          log.error(`Error during reloaded module init: ${id}\n`, error)
        }
        const reload = reloadModule('Error during reloaded module init')
        // !reload: no overlay if reload has been triggered
        // deferredFullReload: overlay would be tro disruptive if reload=false
        if (!reload && deferredFullReload) {
          for (const { id, error } of errors.module) {
            overlay.addError(error, unresolve(id))
          }
        }
      }
      // error(s) in accept callbacks
      if (errors.accept) {
        for (const { id, error } of errors.accept) {
          log.error(`Failed to accept update to module ${id}\n`, error)
        }
        const reload = reloadAccept('Failed to accept update')
        // !error.module: don't mix with module errors; module errors are
        // displayed first because the accept error is probably a consequence
        // of the module error
        if (!reload && deferredFullReload && !errors.module) {
          for (const { id, error } of errors.accept) {
            overlay.addError(error, unresolve(id))
          }
        }
      }
    }

    if (!errors) {
      log.log('Up to date')
    }
  }

  const acceptChanges = changes => {
    const allAccepted = changes
      .map(name => System.resolve(name, rootUrl))
      .filter(id => {
        if (!System.has(id)) {
          // no warning: it can happen with dynamic import() that rollup bundles
          // files that the browser doesn't load
          //   log.warn(`Detected change to unknown module: ${id}`)
          return false
        }
        return System.has(id)
      })
      .map(id => {
        try {
          return applyUpdate(id, true)
        } catch (err) {
          overlay.addError(err)
          throw err
        }
      })

    return allAccepted.length > 0 && allAccepted.every(Boolean)
  }

  const handleApplyAcceptError = err => {
    log.error((err && err.stack) || err)
    const reload = reloadError('Failed to apply update')
    if (!reload) {
      overlay.addError(err)
    }
  }

  const processChanges = changes => {
    // TODO handle removed?

    if (deferredFullReload) {
      log.log('Reloading...')
      doReload()
      return
    }

    if (changes.length === 0) {
      log.log('Nothing changed')
      return
    }

    log.verbose('Apply changes...')

    const accepted = acceptChanges(changes)

    return applyAccepted(accepted).catch(handleApplyAcceptError)
  }

  const onMessage = e => {
    const hot = JSON.parse(e.data)

    if (hot.greeting) {
      applyOptions(hot.greeting)
      // log last: "Enabled" means we're up and running
      log.log('Enabled')
    }

    if (hot.status) {
      switch (hot.status) {
        case 'prepare':
          log.log('Rebuilding...')
          break
      }
    }

    if (hot.changes) {
      processChanges(hot.changes)
    }

    if (hot.errors) {
      const { build } = hot.errors
      if (build) {
        log.log('Build error!')
        overlay.setCompileError(build.formatted || build)
      }
    }
  }

  if (useWebSocket) {
    const ws = new WebSocket(`ws://${wsUrl}`)
    ws.onmessage = onMessage
  } else {
    const source = new EventSource(`//${wsUrl}/~hot`)
    source.onmessage = onMessage
  }
}
