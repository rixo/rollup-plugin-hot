import 'systemjs/dist/system.js'
import 'systemjs/dist/extras/named-register.js'

const hmrFailedMessage = 'Cannot apply HMR update, full reload required'

const depsMap = {}
const acceptCallbacks = {}
const disposeCallbacks = {}
const hot = {
  accept: (id, cb = true) => {
    acceptCallbacks[id] = cb
  },
  dispose: (id, cb = true) => {
    disposeCallbacks[id] = cb
  },
}
System.__hot = hot

const hmrDisposeCallback = id => {}

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
        disposeCb()
      }
    })
  )
  await Promise.all(
    invalidList.map(id => {
      const disposeCb = disposeCallbacks[id]
      delete acceptCallbacks[id]
      delete disposeCallbacks[id]
      delete depsMap[id]
      if (typeof disposeCb === 'function') {
        disposeCb()
      }
      System.delete(id)
    })
  )
  await Promise.all(
    currentReloadQueue.map(async id => {
      const acceptCb = acceptCallbacks[id]
      delete acceptCallbacks[id]
      const module = await System.reload(id) // TODO error handling
      if (typeof acceptCb === 'function') {
        acceptCb()
      }
    })
  )
}

const flush = () => (flushPromise = Promise.resolve(flushPromise).then(doFlush))

const hmrAcceptCallback = (id, soft = false) => {
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
    const accepted = hmrAcceptCallback(pid, true)
    if (!accepted) {
      console.log('unaccepted', pid)
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

  const resolve = proto.resolve
  proto.resolve = function(...args) {
    const [id, parentUrl] = args
    if (id === '@@hot') {
      const url = `${parentUrl}@@hot`
      if (!System.has(url)) {
        // TODO shouldn't this work?? (without requiring named exports)
        // System.set(url, { accept, dispose })
        const accept = (...args) => {
          System.__hot.accept(parentUrl, ...args)
        }
        const dispose = (...args) => {
          System.__hot.dispose(parentUrl, ...args)
        }
        System.register(url, [], function(exports) {
          'use strict'
          return {
            execute: function() {
              exports('accept', accept)
              exports('dispose', dispose)
            },
          }
        })
      }
      return url
    } else {
      return resolve.apply(this, args)
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

const verboseLog = console.log.bind(console, '[HMR]')

ws.onmessage = function(e) {
  var hot = JSON.parse(e.data)

  if (hot.greeting) {
    verboseLog('Enabled')
  }

  if (hot.status) {
    // setHotStatus(hot.status)
  }

  if (hot.changes) {
    verboseLog('Apply changes...')

    Promise.all(
      hot.changes
        .map(name => System.resolve(name))
        .filter(id => System.has(id))
        .map(async id => {
          // if (!change.removed) {
          const accepted = hmrAcceptCallback(id)
          if (accepted) {
            await flush()
          } else {
            // TODO full reload
            verboseLog(hmrFailedMessage)
            window.location.reload()
          }
          // }
        })
    )
      .then(() => {
        verboseLog('Up to date')
      })
      .catch(err => {
        console.error((err && err.stack) || err)
        verboseLog(hmrFailedMessage)
      })
  }
}
