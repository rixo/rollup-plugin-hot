import 'systemjs/dist/system.js'

import { gid } from '../lib/constants'

import installSystemHooks from './system-hooks'
import createWebSocketClient from './client'

const resolveAddress = () => {
  const g =
    (typeof window !== 'undefined' && window) ||
    // eslint-disable-next-line no-undef
    (typeof global !== 'undefined' && global)
  const { host, port, ws, hot } = g[gid]
  return { host, port, ws, hot }
}

const { host, port, ws, hot } = resolveAddress()

installSystemHooks()

createWebSocketClient({ host, port, ws, hot })
