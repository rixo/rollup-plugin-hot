const path = require('path')
const fs = require('fs')
const util = require('util')

// eslint-disable-next-line no-console
const log = (...args) => console.log('[HMR]', ...args)

// eslint-disable-next-line no-console
const debug = (...args) => console.debug('[HMR Server]', ...args)

const posixify = file => file.replace(/[/\\]/g, '/')

const distUrl = '/runtime'

const runtimeFilename = 'hmr-runtime.js'

const runtimeDir = path.join(__dirname, '..', 'dist')

const runtimeFile = path.resolve(runtimeDir, runtimeFilename)

module.exports = {
  log,
  debug,
  posixify,
  distUrl,
  runtimeDir,
  runtimeFile,
  readFile: util.promisify(fs.readFile),
  // writeFile: util.promisify(fs.writeFile),
  // renameFile: util.promisify(fs.rename),
}
