import { forgetDeps, getImporters, getError } from './deps-map'
import { serial } from './utils'

let queue = []
let queueMap = {}

const hotStates = {}

const globalState = {
  beforeUpdateCallbacks: {},
  afterUpdateCallbacks: {},
}

class HotState {
  // data: undefined
  // acceptCallback: null
  // disposeCallback: null

  constructor(id) {
    this.id = id
  }

  dispose(cb) {
    this.disposeCallback = cb
  }

  accept(cb = true) {
    this.acceptCallback = cb
  }

  beforeUpdate(cb) {
    globalState.beforeUpdateCallbacks[this.id] = cb
  }

  afterUpdate(cb) {
    globalState.afterUpdateCallbacks[this.id] = cb
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

const invalidate = (id, reload = false, rerun = true, from) => {
  let item = queueMap[id]
  if (item) {
    if (reload) {
      item.reload = true
    } else if (rerun) {
      item.rerun = true
    }
    queue.splice(queue.indexOf(item), 1)
    queue.push(item)
  } else {
    item = { id, reload, rerun }
    queueMap[id] = item
    queue.push(item)
  }
  if (from != null) {
    if (!item.changedDeps) item.changedDeps = new Set()
    item.changedDeps.add(from)
  }
}

const scheduleRerun = (id, from) => invalidate(id, false, true, from)

const scheduleReload = (id, from) => invalidate(id, true, true, from)

export const flush = serial(async function doFlush() {
  const currentQueue = queue

  queue = []
  queueMap = {}

  const moduleErrors = []
  const acceptErrors = []

  // do all reload/rerun after dispose phase
  const reloadQueue = []

  const beforeUpdateCallbacks = Object.values(globalState.beforeUpdateCallbacks)
  const afterUpdateCallbacks = Object.values(globalState.afterUpdateCallbacks)

  for (const cb of beforeUpdateCallbacks) {
    await cb()
  }

  // for (const { id, reload, rerun } of currentQueue) {
  for (const { id, reload: realReload, rerun, changedDeps } of currentQueue) {
    // TODO rerun is implemented as reload for now, short of a better solution
    const reload = realReload || rerun
    const state = getHotState(id)
    const acceptCallback = state.acceptCallback
    const disposeCallback = state.disposeCallback
    if (reload || rerun) {
      delete globalState.afterUpdateCallbacks[id]
      delete globalState.beforeUpdateCallbacks[id]
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
    if (typeof disposeCallback === 'function') {
      await disposeCallback(state.data)
    }
    if (reload) {
      reloadQueue.push(async () => {
        try {
          await System.reload(id)
          const error = getError(id)
          if (error) {
            moduleErrors.push({ id, error })
          } else {
            const acceptData = {
              id,
              // changedDeps,
              hasChangedDeps: Boolean(changedDeps && changedDeps.size > 0),
            }
            if (typeof acceptCallback === 'function') {
              try {
                await acceptCallback(acceptData)
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

  for (const cb of afterUpdateCallbacks) {
    await cb()
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

export const applyUpdate = (id, forceReload = false, from = null) => {
  const parentIds = getImporters(id)

  if (forceReload) {
    scheduleReload(id, from)
  } else {
    scheduleRerun(id, from)
  }

  const accepted = getHotState(id).acceptCallback
  if (accepted) {
    return true
  }

  if (!parentIds) {
    return false
  }

  let every = true
  for (const pid of parentIds) {
    // TODO these modules don't need a reload, just refreshing their
    //      bindings + execute again
    const accepted = applyUpdate(pid, false, id)
    if (!accepted) {
      every = false
    }
  }

  return every
}
