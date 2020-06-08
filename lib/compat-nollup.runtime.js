/* eslint-env browser */

// eslint-disable-next-line no-undef
const g = typeof window !== 'undefined' ? window : global

const globalKey =
  typeof Symbol !== 'undefined'
    ? Symbol('ROLLUP_PLUGIN_SVELTE_HMR')
    : '__ROLLUP_PLUGIN_SVELTE_HMR'

if (!g[globalKey]) {
  const beforeCallbacks = []
  const afterCallbacks = []

  const fire = listeners => (...args) =>
    listeners.filter(Boolean).forEach(fn => fn(...args))

  const addListenerTo = listeners => fn => {
    listeners.push(fn)
    return () => {
      listeners.splice(listeners.indexOf(fn), 1)
    }
  }

  const fireBeforeUpdate = fire(beforeCallbacks)

  const fireAfterUpdate = fire(afterCallbacks)

  const beforeUpdate = addListenerTo(beforeCallbacks)

  const afterUpdate = addListenerTo(afterCallbacks)

  // do updating refs count to know when a full update has been applied
  let updatingCount = 0

  const notifyStart = () => {
    if (updatingCount === 0) {
      fireBeforeUpdate()
    }
    updatingCount++
  }

  const notifyError = reload => err => {
    const errString = (err && err.stack) || err
    // eslint-disable-next-line no-console
    console.error(
      '[HMR] Failed to accept update (nollup compat mode)',
      errString
    )
    reload()
    notifyEnd()
  }

  const notifyEnd = () => {
    updatingCount--
    if (updatingCount === 0) {
      // NOTE this message is important for timing in tests
      // eslint-disable-next-line no-console
      console.log('[HMR] Up to date')
      fireAfterUpdate()
    }
  }

  g[globalKey] = {
    hotStates: {},
    notifyStart,
    notifyError,
    notifyEnd,
    beforeUpdate,
    afterUpdate,
  }
}

const reload = () => window.reload()

export default m => {
  const { id, hot } = m

  const globalState = g[globalKey]

  const { hotStates, notifyStart, notifyError, notifyEnd } = globalState

  const hotState = (hotStates[id] = hotStates[id] || { declined: false })

  let disposeHandler
  let hasAcceptHandler = false

  const cleanups = []

  const doCleanup = () => cleanups.forEach(fn => fn())

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
    hot.accept(async e => {
      notifyStart()
      if (disposeHandler) {
        doCleanup()
        hotState.data = {}
        await disposeHandler(hotState.data)
      }
      require(id)
      if (handler) {
        const check = status => {
          if (status === 'idle') {
            hot.removeStatusHandler(check)
            const bubbled =
              e && e.disposed
                ? e.disposed.length > 1 || e.disposed[0] !== id
                : undefined
            Promise.resolve(handler({ bubbled }))
              .then(notifyEnd)
              .catch(notifyError(reload))
          }
        }
        hot.addStatusHandler(check)
        check(hot.status())
      } else {
        setTimeout(notifyEnd)
      }
    })
  }

  const beforeUpdate = (...args) => {
    cleanups.push(globalState.beforeUpdate(...args))
  }

  const afterUpdate = (...args) => {
    cleanups.push(globalState.afterUpdate(...args))
  }

  return {
    data: hotState.data,
    dispose,
    accept,
    beforeUpdate,
    afterUpdate,
  }
}
