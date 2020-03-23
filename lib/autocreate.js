/**
 * Autocreate missing imported files.
 *
 * `resolveId` hook in first position detects non-existent files that are being
 * resolved and creates a placeholder if necessary.
 *
 * `load` placed last collects files that have been resolved but can't be read
 * -- i.e. those that have been deleted.
 *
 * Recreating deleted files is optional because it might be perceived as a tad
 * intrusive.
 */

const fs = require('fs')
const path = require('path')
const { promisify } = require('util')
const { createFilter } = require('rollup-pluginutils')

const name = 'hot:autocreate'

const encoding = 'utf8'

const exists = async p => new Promise(resolve => fs.exists(p, resolve))

const notExists = async p => !(await exists(p))

const mkdir = promisify(fs.mkdir)
const writeFile = promisify(fs.writeFile)
const unlink = promisify(fs.unlink)

const writeEmptyFile = async (importee, defaultExtension) => {
  const ext = path.extname(importee)
  const file = ext ? importee : importee + defaultExtension
  const dir = path.dirname(file)
  if (await notExists(dir)) {
    await mkdir(dir, { recursive: true }) // node 10.12
  }
  const contents = ''
  await writeFile(file, contents, encoding)
  return contents
}

const before = ({ filter, compatNollup, warn, defaultExtension, delay }) => {
  const cache = {}
  // prevent infinite recursion (skipSelf:true not enough apparently... bug?)
  const resolving = {}

  const resolvePath = (source, from) =>
    source.substr(0, 2) === './'
      ? path.join(path.dirname(from), source)
      : source

  const resolveMethod = compatNollup ? 'resolveId' : 'resolve'

  const resolve = async (ctx, hash, source, from) => {
    resolving[hash] = true
    try {
      const method = resolveMethod
      return await ctx[method](source, from, { skipSelf: true })
    } finally {
      delete resolving[hash]
    }
  }

  return {
    name: name + ':before',

    async renderStart() {
      if (delay) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    },

    async resolveId(source, from) {
      const hash = `${from}:|:${source}`

      // prevent inifinite recursion
      if (resolving[hash]) return null

      const resolvedByOthers = await resolve(this, hash, source, from)

      if (resolvedByOthers) {
        return resolvedByOthers
      }

      const file = resolvePath(source, from)

      if (cache[file]) return null

      cache[file] = true

      if (!filter(file)) return null

      if (await exists(file)) return null

      if (warn) {
        this.warn(`creating empty file at ${file}`)
      }

      await writeEmptyFile(file, defaultExtension)

      const resolvedAfter = await resolve(this, hash, source, from)

      if (!resolvedAfter) {
        await unlink(file)
        return null
      }

      delete cache[file]

      return resolvedAfter
    },
  }
}

const after = ({ filter, warn, defaultExtension }) => ({
  name: name + ':after',
  async load(id) {
    if (await exists(id)) return null
    if (!filter(id)) return null
    if (warn) {
      this.warn(
        `recreating empty file at ${id} (module still imported into the bundle)`
      )
    }
    return await writeEmptyFile(id, defaultExtension)
  },
})

// autocreate plugin
function autoCreateUnits({
  nollup: compatNollup = !!process.env.NOLLUP,
  include,
  exclude,
  defaultExtension = '.js',
  recreate = true,
  warn = true,
  // creating empty files is somewhat the normal expected behaviour for an
  // autocreate plugin...
  warnCreate = false,
  // however, recreating a file that the user has just explicitely deleted
  // might prove a bit surprising (we still need to do it if we want to avoid
  // breaking the Rollup watcher)
  warnRecreate = !!warn,
  // delay gives some time to other watcher processes (namely: Routify) to pick
  // the change -- we want Routify (or anything) to pick the change first,
  // because then it will delay compilation until it has finished recreating its
  // generated file (routes.js), which might then stop importing the file we
  // would otherwise try to recreate (causing Routify to regenerate with our
  // just deleted file!)
  delay = false,
} = {}) {
  const filter = createFilter(include, exclude)
  return {
    before: before({
      filter,
      defaultExtension,
      compatNollup,
      warn: warnCreate,
      delay,
    }),
    after: recreate
      ? after({ filter, defaultExtension, compatNollup, warn: warnRecreate })
      : false,
  }
}

const autoCreate = cfg => ({
  name: 'auto-create',
  options: options => {
    const { plugins: initialPlugins = [] } = options
    const { before, after } = autoCreateUnits(cfg)
    const plugins = [before, ...initialPlugins, after]
    return { ...options, plugins }
  },
})

module.exports = autoCreate
