import { forgetDeps, getImporters } from './deps-map'
import { serial } from './utils'

const acceptCallbacks = {}
const disposeCallbacks = {}

let queue = []
let queueMap = {}

export const hot = {
  accept(cb = true) {
    acceptCallbacks[this.id] = cb
  },
  dispose(cb = true) {
    disposeCallbacks[this.id] = cb
  },
}

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

export const flush = serial(async function doFlush() {
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

export const applyUpdate = (id, forceReload = false) => {
  const parentIds = getImporters(id)

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
