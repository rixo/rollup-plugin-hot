import { forgetDeps, getImporters, getError } from './deps-map'
import { serial } from './utils'

let queue = []
let queueMap = {}

const hotStates = {}

class HotState {
  // data: undefined
  // acceptCallback: null
  // disposeCallback: null

  constructor(id) {
    this.id = id
  }

  accept(cb = true) {
    this.acceptCallback = cb
  }

  dispose(cb) {
    this.disposeCallback = cb
  }
}

const getHotState = id => {
  const existing = hotStates[id]
  if (existing) {
    return existing
  }
  const state = new HotState(id)
  hotStates[id] = state
  return state
}

export const createHotContext = id => getHotState(id)

const invalidate = (id, reload = false, rerun = true) => {
  const item = queueMap[id]
  if (item) {
    if (reload) {
      item.reload = true
    } else if (rerun) {
      item.rerun = true
    }
    queue.splice(queue.indexOf(item), 1)
    queue.push(item)
  } else {
    const item = { id, reload, rerun }
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

  const moduleErrors = []
  const acceptErrors = []

  // do all reload/rerun after dispose phase
  const reloadQueue = []

  // for (const { id, reload, rerun } of currentQueue) {
  for (const { id, reload: realReload, rerun } of currentQueue) {
    // TODO rerun is implemented as reload for now, short of a better solution
    const reload = realReload || rerun
    const state = getHotState(id)
    const acceptCb = state.acceptCallback
    const disposeCb = state.disposeCallback
    if (reload || rerun) {
      delete state.acceptCallback
      delete state.disposeCallback
      if (reload) {
        forgetDeps(id)
      }
      // aligned with Webpack:
      // - module.hot.data is undefined on initial module load
      // - module.hot.data defaults to {} after a HMR update, even if the
      //   module has no dispose handlers
      state.data = {}
    }
    if (typeof disposeCb === 'function') {
      await disposeCb(state.data)
    }
    if (reload) {
      reloadQueue.push(async () => {
        try {
          await System.reload(id)
          const error = getError(id)
          if (error) {
            moduleErrors.push({ id, error })
          } else {
            if (typeof acceptCb === 'function') {
              try {
                await acceptCb()
              } catch (error) {
                acceptErrors.push({ id, error })
              }
            }
          }
        } catch (error) {
          moduleErrors.push({ id, error })
        }
      })
    } else if (rerun) {
      throw new Error('TODO')
    } else {
      System.delete(id)
    }
  }

  for (const reload of reloadQueue) {
    await reload()
  }

  const total = moduleErrors.length + acceptErrors.length
  const errors =
    total === 0
      ? null
      : {
          module: moduleErrors.length > 0 ? moduleErrors : null,
          accept: acceptErrors.length > 0 ? acceptErrors : null,
        }

  return { errors }
})

export const applyUpdate = (id, forceReload = false) => {
  const parentIds = getImporters(id)

  if (forceReload) {
    scheduleReload(id)
  } else {
    invalidate(id)
  }

  const accepted = getHotState(id).acceptCallback
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
