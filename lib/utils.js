// eslint-disable-next-line no-console
const log = (...args) => console.log('[HMR]', ...args)

// eslint-disable-next-line no-console
const debug = (...args) => console.debug('[HMR Server]', ...args)

module.exports = {
  log,
  debug,
}
