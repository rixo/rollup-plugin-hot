/* global location */

// eslint-disable-next-line no-undef
const g = typeof window !== 'undefined' ? window : global

const globalKey =
  typeof Symbol !== 'undefined'
    ? Symbol('ROLLUP_PLUGIN_SVELTE_HMR')
    : '__ROLLUP_PLUGIN_SVELTE_HMR'

if (!g[globalKey]) {
  g[globalKey] = {}
}

const reload = () => {
  if (
    typeof location === 'undefined' ||
    typeof location.reload !== 'function'
  ) {
    // eslint-disable-next-line no-console
    console.warn('[HMR] Full reload required')
    return
  }
  location.reload()
}

export default m => {
  // const { m, id, hotOptions, reload } = args;
  const { id, hot } = m

  const globState = g[globalKey]

  const hotState = (globState[id] = globState[id] || { declined: false })

  let disposeHandler
  let hasAcceptHandler = false

  if (hotState.declined) {
    reload()
  }

  const dispose = handler => {
    if (disposeHandler) {
      throw new Error('Multiple dispose handlers not supported')
    }
    disposeHandler = handler
  }

  // TODO not used anymore... remove?
  // eslint-disable-next-line no-unused-vars
  const decline = () => {
    if (hotState.declined) {
      // eslint-disable-next-line no-console
      console.warn('[HMR] Already declined: ' + id)
    }
    hotState.declined = true
  }

  const accept = handler => {
    if (hasAcceptHandler) {
      throw new Error('Multiple accept handlers not supported')
    }
    hasAcceptHandler = true
    hot.accept(async () => {
      if (disposeHandler) {
        hotState.data = {}
        disposeHandler(hotState.data)
      }
      require(id)
      if (handler) {
        handler()
      }
    })
  }

  return {
    data: hotState.data,
    dispose,
    accept,
  }
}
