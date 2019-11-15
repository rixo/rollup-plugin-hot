/* eslint-env node */

const hotPlugin = require('./lib/hmr')
const compatNollup = require('./lib/compat-nollup')
const autoCreate = require('./lib/autocreate')

const { appendCompatNollup } = compatNollup

module.exports = Object.assign(hotPlugin, {
  compatNollup,
  appendCompatNollup,
  autoCreate,
})
