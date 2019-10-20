const path = require('path')
const fs = require('fs')

// eslint-disable-next-line no-console
const log = (...args) => console.log('[HMR]', ...args)

// eslint-disable-next-line no-console
const debug = (...args) => console.debug('[HMR Server]', ...args)

const posixify = file => file.replace(/[/\\]/g, '/')

const distUrl = '/runtime'

const runtimeFilename = 'hmr-runtime.js'

const runtimeDir = path.join(__dirname, '..', 'dist')

const runtimeFile = path.resolve(runtimeDir, runtimeFilename)

const readFile = (...args) =>
  new Promise((resolve, reject) => {
    fs.readFile(...args, (err, contents) => {
      if (err) reject(err)
      else resolve(contents)
    })
  })

module.exports = {
  log,
  debug,
  posixify,
  distUrl,
  runtimeDir,
  runtimeFile,
  readFile,
}
