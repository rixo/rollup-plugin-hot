/* eslint-env node */

const hotPlugin = require('./lib/hmr')
const autoCreate = require('./lib/autocreate')

module.exports = Object.assign(hotPlugin, { autoCreate })
