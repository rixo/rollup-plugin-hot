/* eslint-disable no-console */
const logPrefix = '[HMR]'

export const verbose = console.debug.bind(console, logPrefix)

export const log = console.log.bind(console, logPrefix)

export const warn = console.warn.bind(console, logPrefix)

export const error = console.error.bind(console, logPrefix)

export const clear = console.clear.bind(console)
