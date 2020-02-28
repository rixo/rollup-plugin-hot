import 'systemjs/dist/system.js'

import { gid } from '../lib/constants'

import installSystemHooks from './system-hooks'
import createWebSocketClient from './client'

const resolveAddress = () => {
  const g =
    (typeof window !== 'undefined' && window) ||
    // eslint-disable-next-line no-undef
    (typeof global !== 'undefined' && global)
  const { host, port, ws } = g[gid]
  return { host, port, ws }
}

const { host, port, ws } = resolveAddress()

installSystemHooks()

createWebSocketClient({ host, port, ws })
