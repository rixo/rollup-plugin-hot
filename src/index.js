import 'systemjs/dist/system.js'

import installSystemHooks from './system-hooks'
import ErrorOverlay from './overlay'

const hmrFailedMessage = 'Cannot apply HMR update'

const overlay = ErrorOverlay()

const depsMap = {}
const importersMap = {}

const acceptCallbacks = {}
const disposeCallbacks = {}

const hot = {
  accept(cb = true) {
    acceptCallbacks[this.id] = cb
  },
  dispose(cb = true) {
    disposeCallbacks[this.id] = cb
  },
}

const serial = handler => {
  let promise
  return () => (promise = promise ? promise.then(handler) : handler())
}

let queue = []
let queueMap = {}

const invalidate = (id, reload = false, rerun = true) => {
  const item = queueMap[id]
  if (item) {
    queue.splice(item.index, 1)
    item.index = queue.length
    if (reload) {
      item.reload = true
    } else if (rerun) {
      item.rerun = true
    }
    queue.push(item)
  } else {
    const item = { index: queue.length, id, reload, rerun }
    queueMap[id] = item
    queue.push(item)
  }
}

const scheduleRerun = id => invalidate(id, false, true)

const scheduleReload = id => invalidate(id, true)

const flush = serial(async function doFlush() {
  const currentQueue = queue

  queue = []
  queueMap = {}

  // for (const { id, reload, rerun } of currentQueue) {
  for (const { id, reload: realReload, rerun } of currentQueue) {
    // TODO rerun is implemented as reload for now, short of a better solution
    const reload = realReload || rerun
    const disposeCb = disposeCallbacks[id]
    if (reload || rerun) {
      delete acceptCallbacks[id]
      delete disposeCallbacks[id]
      if (reload) {
        forgetDeps(id)
      }
    }
    if (typeof disposeCb === 'function') {
      await disposeCb()
    }
    if (reload) {
      await System.reload(id)
    } else if (rerun) {
      throw new Error('TODO')
    } else {
      System.delete(id)
    }
  }
})

const applyUpdate = (id, forceReload = false) => {
  const parentIds = importersMap[id]

  if (forceReload) {
    scheduleReload(id)
  } else {
    invalidate(id)
  }

  const accepted = acceptCallbacks[id]
  if (accepted) {
    scheduleRerun(id)
    return true
  }

  if (!parentIds) {
    return false
  }

  let every = true
  for (const pid of parentIds) {
    // TODO these modules don't need a reload, just refreshing their
    //      bindings + execute again
    const accepted = applyUpdate(pid)
    if (!accepted) {
      every = false
    }
  }

  return every
}

const getImporterEntry = id => {
  const existing = importersMap[id]
  if (!existing) {
    return (importersMap[id] = [])
  }
  return existing
}

// TODO building this reverse lookup map is probably overkill
const setDeps = (id, deps) => {
  depsMap[id] = deps
  deps.forEach(dep => {
    const entry = getImporterEntry(dep)
    entry.push(id)
  })
}

const forgetDeps = id => {
  const deps = depsMap[id]
  if (deps) {
    delete depsMap[id]
    for (const dep of deps) {
      const importerDeps = importersMap[dep]
      if (!importerDeps) continue
      const index = importerDeps.indexOf(id)
      if (index < 0) continue
      importerDeps.splice(index, 1)
    }
  }
}

const logPrefix = '[HMR]'
/* eslint-disable no-console */
const verboseLog = console.debug.bind(console, logPrefix)
const log = console.log.bind(console, logPrefix)
const logError = console.error.bind(console, logPrefix)
/* eslint-enable no-console */

const noFullReload = false
const fullReload = msg => {
  // yes, the log message is only visible with something like preserveLog
  const action = noFullReload ? 'full reload needed' : 'doing a full reload'
  log(`${msg}, ${action}`)
  window.location.reload()
}

installSystemHooks({ hot, setDeps })

// TODO
const hmrDead = false

const ws = new WebSocket(`ws://${location.hostname}:38670`)

ws.onmessage = function(e) {
  const hot = JSON.parse(e.data)

  if (hot.greeting) {
    log('Enabled')
  }

  if (hot.status) {
    switch (hot.status) {
      case 'prepare':
        log('Rebuilding...')
        break
    }
  }

  if (hot.changes) {
    // TODO handle removed?

    if (hmrDead) {
      fullReload('A previous update failed')
    }

    verboseLog('Apply changes...')

    overlay.setCompileError(null)
    overlay.clearErrors()

    Promise.all(
      hot.changes
        .map(name => System.resolve(name))
        .filter(id => System.has(id))
        .map(async id => {
          try {
            return applyUpdate(id, true)
          } catch (err) {
            overlay.addError(err)
            throw err
          }
        })
    )
      .then(async accepted => {
        if (accepted) {
          await flush()
        } else {
          fullReload(hmrFailedMessage)
        }
        log('Up to date')
      })
      .catch(err => {
        logError((err && err.stack) || err)
        log(hmrFailedMessage)
      })
  }

  if (hot.errors) {
    const { build } = hot.errors
    if (build) {
      log('Build error!')
      overlay.setCompileError(build.formatted || build)
    }
  }
}
