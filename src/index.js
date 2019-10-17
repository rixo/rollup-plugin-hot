import 'systemjs/dist/system.js'
import ErrorOverlay from './overlay'

const hmrFailedMessage = 'Cannot apply HMR update, full reload required'

const overlay = ErrorOverlay()

const depsMap = {}
const acceptCallbacks = {}
const disposeCallbacks = {}
const systemHot = {
  accept(cb = true) {
    acceptCallbacks[this.url] = cb
  },
  dispose(cb = true) {
    disposeCallbacks[this.url] = cb
  },
}

let invalidated = {}
let reloadQueue = []

const invalidate = id => {
  if (invalidated[id]) {
    invalidated[id]++
  } else {
    invalidated[id] = 1
  }
}

const scheduleReload = id => {
  const index = reloadQueue.indexOf(id)
  if (index > -1) {
    reloadQueue.splice(index, 1)
  }
  reloadQueue.push(id)
}

const compareValueAsc = ([, a], [, b]) => a - b

const getKey = ([k]) => k

const notIn = list => x => !list.includes(x)

let flushPromise

const doFlush = async () => {
  const currentReloadQueue = reloadQueue
  const currentInvalidated = invalidated
  reloadQueue = []
  invalidated = []
  const invalidList = Object.entries(currentInvalidated)
    .sort(compareValueAsc)
    .map(getKey)
    .filter(notIn(currentReloadQueue))
  await Promise.all(
    currentReloadQueue.map(async id => {
      const disposeCb = disposeCallbacks[id]
      delete disposeCallbacks[id]
      delete depsMap[id]
      if (typeof disposeCb === 'function') {
        await disposeCb()
      }
    })
  )
  await Promise.all(
    invalidList.map(async id => {
      const disposeCb = disposeCallbacks[id]
      delete acceptCallbacks[id]
      delete disposeCallbacks[id]
      delete depsMap[id]
      if (typeof disposeCb === 'function') {
        await disposeCb()
      }
      System.delete(id)
    })
  )
  await Promise.all(
    currentReloadQueue.map(async id => {
      const acceptCb = acceptCallbacks[id]
      delete acceptCallbacks[id]
      await System.reload(id) // TODO error handling
      if (typeof acceptCb === 'function') {
        await acceptCb()
      }
    })
  )
}

const flush = () => (flushPromise = Promise.resolve(flushPromise).then(doFlush))

const hmrAcceptCallback = id => {
  const parentIds = depsMap[id]

  invalidate(id)

  const accepted = acceptCallbacks[id]
  if (accepted) {
    scheduleReload(id)
    return true
  }

  if (!parentIds) {
    return false
  }

  let every = true
  for (const pid of parentIds) {
    // TODO these modules don't need a reload, just refreshing their
    //      bindings + execute again
    const accepted = hmrAcceptCallback(pid, true)
    if (!accepted) {
      every = false
    }
  }

  return every
}

const getDepsEntry = id => {
  const existing = depsMap[id]
  if (!existing) {
    return (depsMap[id] = [])
  }
  return existing
}

{
  const proto = System.constructor.prototype

  const createContext = proto.createContext
  proto.createContext = function(...args) {
    return {
      ...createContext.apply(this, args),
      ...systemHot,
    }
  }

  const onload = proto.onload
  proto.onload = function(...args) {
    const [err, id, deps] = args
    if (!err) {
      // TODO building this reverse lookup map is probably overkill
      deps.forEach(dep => {
        const entry = getDepsEntry(dep)
        entry.push(id)
      })
    }
    return onload.apply(this, args)
  }
}

const ws = new WebSocket(`ws://${location.hostname}:38670`)

const logPrefix = '[HMR]'
/* eslint-disable no-console */
const verboseLog = console.debug.bind(console, logPrefix)
const log = console.log.bind(console, logPrefix)
const logError = console.error.bind(console, logPrefix)
/* eslint-enable no-console */

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
    // setHotStatus(hot.status)
  }

  if (hot.changes) {
    verboseLog('Apply changes...')

    overlay.setCompileError(null)
    overlay.clearErrors()

    Promise.all(
      hot.changes
        .map(name => System.resolve(name))
        .filter(id => System.has(id))
        .map(async id => {
          try {
            // if (!change.removed) {
            const accepted = hmrAcceptCallback(id)
            if (accepted) {
              await flush()
            } else {
              // TODO full reload
              log(hmrFailedMessage)
              window.location.reload()
            }
            // }
          } catch (err) {
            overlay.addError(err)
            throw err
          }
        })
    )
      .then(() => {
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
