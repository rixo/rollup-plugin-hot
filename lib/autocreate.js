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

const writeEmptyFile = async file => {
  const dir = path.dirname(file)
  if (await notExists(dir)) {
    await mkdir(dir, { recursive: true }) // node 10.12
  }
  const contents = ''
  await writeFile(file, contents, encoding)
  return contents
}

const before = ({ filter, compatNollup, warn }) => {
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

      await writeEmptyFile(file)

      const resolvedAfter = await resolve()

      if (!resolvedAfter) {
        await unlink(file)
        return null
      }

      delete cache[file]

      return resolvedAfter
    },
  }
}

const after = ({ filter, warn }) => ({
  name: name + ':after',
  async load(id) {
    if (await exists(id)) return null
    if (!filter(id)) return null
    if (warn) {
      this.warn(
        `recreating empty file at ${id} (module still imported into the bundle)`
      )
    }
    return await writeEmptyFile(id)
  },
})

// autocreate plugin
function autoCreateUnits({
  nollup: compatNollup = !!process.env.NOLLUP,
  include,
  exclude,
  recreate = true,
  warn = true,
  // creating empty files is somewhat the normal expected behaviour for an
  // autocreate plugin...
  warnCreate = false,
  // however, recreating a file that the user has just explicitely deleted
  // might prove a bit surprising (we still need to do it if we want to avoid
  // breaking the Rollup watcher)
  warnRecreate = !!warn,
} = {}) {
  const filter = createFilter(include, exclude)
  return {
    before: before({ filter, compatNollup, warn: warnCreate }),
    after: recreate
      ? after({ filter, compatNollup, warn: warnRecreate })
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
