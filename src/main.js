import 'systemjs/dist/system.js'

import { gid } from '../lib/constants'

import installSystemHooks from './system-hooks'
import createWebSocketClient from './client'

const resolveAddress = () => {
  const g =
    (typeof window !== 'undefined' && window) ||
    // eslint-disable-next-line no-undef
    (typeof global !== 'undefined' && global)
  const { host, port } = g[gid]
  return { host, port }
}

const { host, port } = resolveAddress()

installSystemHooks()

createWebSocketClient({ host, port })
