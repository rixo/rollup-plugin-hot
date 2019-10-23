const path = require('path')
const fs = require('fs')
const util = require('util')

const logPrefix = '[HMR]'

// eslint-disable-next-line no-console
const log = (...args) => console.log(logPrefix, ...args)

// eslint-disable-next-line no-console
const debug = (...args) => console.debug(logPrefix, ...args)

const posixify = file => file.replace(/[/\\]/g, '/')

const distUrl = '/runtime'

const runtimeFilename = 'hmr-runtime.js'

const runtimeDir = path.join(__dirname, '..', 'dist')

const runtimeFile = path.resolve(runtimeDir, runtimeFilename)

const pipe = (...fns) => x => fns.reduce((a, b) => b(a), x)

const slash = url => (url.substr(-1) === '/' ? url : url + '/')

module.exports = {
  noop: () => {},
  log,
  debug,
  posixify,
  distUrl,
  runtimeDir,
  runtimeFile,
  pipe,
  slash,
  readFile: util.promisify(fs.readFile),
  // writeFile: util.promisify(fs.writeFile),
  // renameFile: util.promisify(fs.rename),
}
