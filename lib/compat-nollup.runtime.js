/* eslint-env browser */

// eslint-disable-next-line no-undef
const g = typeof window !== 'undefined' ? window : global

const globalKey =
  typeof Symbol !== 'undefined'
    ? Symbol('ROLLUP_PLUGIN_SVELTE_HMR')
    : '__ROLLUP_PLUGIN_SVELTE_HMR'

if (!g[globalKey]) {
  // do updating refs count to know when a full update has been applied
  let updatingCount = 0

  const notifyStart = () => {
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
    }
  }

  g[globalKey] = {
    hotStates: {},
    notifyStart,
    notifyError,
    notifyEnd,
  }
}

const reload = () => window.reload()

export default m => {
  const { id, hot } = m

  const { hotStates, notifyStart, notifyError, notifyEnd } = g[globalKey]

  const hotState = (hotStates[id] = hotStates[id] || { declined: false })

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
    hot.accept(async e => {
      if (disposeHandler) {
        hotState.data = {}
        await disposeHandler(hotState.data)
      }
      require(id)
      notifyStart()
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

  return {
    data: hotState.data,
    dispose,
    accept,
  }
}
