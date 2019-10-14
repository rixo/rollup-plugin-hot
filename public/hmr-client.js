{
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

  const flush = () =>
    (flushPromise = Promise.resolve(flushPromise).then(doFlush))

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

  const proto = System.constructor.prototype
  const onload = proto.onload
  proto.onload = function(...args) {
    const [err, id, deps] = args
    if (!err) {
      // console.log('onload', id, deps)
      // const baseUrl = System.resolve('/')
      // const relative = url => {
      //   if (url.substring(0, baseUrl.length) === baseUrl) {
      //     return url.substr(baseUrl.length - 1)
      //   } else {
      //     return url
      //   }
      // }
      const relative = x => x
      const relativeId = relative(id)
      deps.forEach(dep => {
        const rel = relative(dep)
        const entry = getDepsEntry(rel)
        entry.push(relativeId)
      })
    }
    return onload.apply(this, args)
  }

  const ws = new WebSocket(`ws://${location.hostname}:38670`)

  const verboseLog = console.log.bind(console)

  ws.onmessage = function(e) {
    var hot = JSON.parse(e.data)

    if (hot.greeting) {
      verboseLog('Enabled')
    }

    if (hot.status) {
      // setHotStatus(hot.status)
    }

    if (hot.changes) {
      verboseLog('Changes Received', hot.changes)

      hot.changes.forEach(name => {
        // const id = System.resolve(name)
        // if (depsMap[id]) {
        //   depsMap[id].forEach(depId => {
        //     // TODO dispose
        //     System.delete(depId)
        //     hmrDisposeCallback(depId)
        //   })
        //   delete depsMap[id]
        // }
        // // const load = System.get(id)
        // System.delete(id)
        // hmrDisposeCallback(id)

        // TODO accept
        // System.import(name)

        // if (!change.removed) {
        const accepted = hmrAcceptCallback(System.resolve(name))
        if (accepted) {
          flush()
        } else {
          // TODO full reload
          console.log('Cannot apply HMR update, full reload required')
          window.location.reload()
        }
        // }

        // System.reload(System.resolve(name))
      })

      // hot.changes.forEach(function (change) {
      //     hmrDisposeCallback(change.id);
      //
      //     if (!change.removed) {
      //         modules[change.id] = eval('(' + change.code + ')');
      //         hmrAcceptCallback(change.id);
      //     }
      // });
      //
      // setHotStatus('idle')
    }
  }
}
