import ErrorOverlay from './overlay'
import * as log from './log'

const hmrFailedMessage = 'Cannot apply HMR update'

export default ({ applyUpdate, flush, noFullReload = false, port = 38670 }) => {
  const overlay = ErrorOverlay()

  const hmrDead = false

  const wsUrl = `${location.hostname}:${port}`
  const ws = new WebSocket(`ws://${wsUrl}`)

  let clearConsole = false
  let rootUrl

  const doFullReload = msg => {
    // yes, the log message is only visible with something like preserveLog
    const action = noFullReload ? 'full reload needed' : 'doing a full reload'
    log.log(`${msg}, ${action}`)
    window.location.reload()
  }

  ws.onmessage = function(e) {
    const hot = JSON.parse(e.data)

    if (hot.greeting) {
      log.log('Enabled')
      clearConsole = hot.greeting.clearConsole
      if (hot.greeting.inMemory) {
        rootUrl = `${location.protocol}//${wsUrl}/`
      }
    }

    if (hot.status) {
      switch (hot.status) {
        case 'prepare':
          log.log('Rebuilding...')
          break
      }
    }

    if (hot.changes) {
      // TODO handle removed?

      if (hmrDead) {
        doFullReload('A previous update failed')
      } else {
        log.verbose('Apply changes...')

        overlay.setCompileError(null)
        overlay.clearErrors()

        Promise.all(
          hot.changes
            .map(name => System.resolve(name, rootUrl))
            .filter(id => {
              if (!System.has(id)) {
                log.warn(`Detected change to unknown module: ${id}`)
                return false
              }
              return System.has(id)
            })
            .map(async id => {
              try {
                return applyUpdate(id, true)
              } catch (err) {
                overlay.addError(err)
                throw err
              }
            })
        )
          .then(async accepted => {
            if (accepted) {
              await flush()
            } else {
              doFullReload(hmrFailedMessage)
            }
            if (clearConsole) {
              log.clear()
            }
            log.log('Up to date')
          })
          .catch(err => {
            log.error((err && err.stack) || err)
            log.log(hmrFailedMessage)
          })
      }
    }

    if (hot.errors) {
      const { build } = hot.errors
      if (build) {
        log.log('Build error!')
        overlay.setCompileError(build.formatted || build)
      }
    }
  }
}
