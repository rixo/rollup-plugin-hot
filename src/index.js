import 'systemjs/dist/system.js'

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
      // if (!System.has(url)) {
      //   const accept = (...args) => {
      //     System.__hot.accept(parentUrl, ...args)
      //   }
      //   const dispose = (...args) => {
      //     System.__hot.dispose(parentUrl, ...args)
      //   }
      //
      //   // TODO shouldn't this work?? (without requiring named exports)
      //   //
      //   // System.set(url, { accept, dispose })
      //
      //   // TODO (report) this triggers a very subtle race condition where
      //   // getRegister resolves the "virtual" (named) module in place of
      //   // another one that has just loaded
      //   //
      //   // System.register(url, [], function(exports) {
      //   //   'use strict'
      //   //   return {
      //   //     execute: function() {
      //   //       exports({ accept, dispose })
      //   //     },
      //   //   }
      //   // })
      // }
      return url
    } else {
      return resolve.apply(this, args)
    }
  }

  const instantiate = proto.instantiate
  proto.instantiate = function(...args) {
    const [url, firstParentUrl] = args
    if (url.substr(-5) === '@@hot') {
      // NOTE see above, this is what ended up working
      return [
        [],
        exports => ({
          execute() {
            const parentUrl = firstParentUrl
            const accept = (..._) => System.__hot.accept(parentUrl, ..._)
            const dispose = (..._) => System.__hot.dispose(parentUrl, ..._)
            exports({ accept, dispose })
          },
        }),
      ]
    }
    return instantiate.apply(this, args)
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
