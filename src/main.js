import 'systemjs/dist/system.js'

import installSystemHooks from './system-hooks'
import createWebSocketClient from './client'
import { setDeps } from './deps-map'
import { hot, applyUpdate, flush } from './hot-api'

installSystemHooks({ hot, setDeps })

createWebSocketClient({ applyUpdate, flush })
