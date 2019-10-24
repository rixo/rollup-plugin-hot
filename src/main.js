import 'systemjs/dist/system.js'

import { gid } from '../lib/constants'

import installSystemHooks from './system-hooks'
import createWebSocketClient from './client'

const resolvePort = () => {
  const g =
    (typeof window !== 'undefined' && window) ||
    // eslint-disable-next-line no-undef
    (typeof global !== 'undefined' && global)
  const { port } = g[gid]
  return port
}

const port = resolvePort()

installSystemHooks()

createWebSocketClient({ port })
