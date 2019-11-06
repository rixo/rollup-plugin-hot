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

const before = ({ filter }) => {
  const cache = {}
  // prevent infinite recursion (skipSelf:true not enough apparently... bug?)
  const resolving = {}

  const resolvePath = (source, from) =>
    source.substr(0, 2) === './'
      ? path.join(path.dirname(from), source)
      : source

  return {
    name: name + ':before',

    async resolveId(source, from) {
      const hash = `${from}:::${source}`

      // prevent inifinite recursion
      if (resolving[hash]) return null

      const resolve = async () => {
        resolving[hash] = true
        try {
          return await this.resolve(source, from, { skipSelf: true })
        } finally {
          delete resolving[hash]
        }
      }

      const alreadyResolved = await resolve()

      if (alreadyResolved) {
        return alreadyResolved
      }

      const file = resolvePath(source, from)

      if (cache[file]) return null

      cache[file] = true

      if (!filter(file)) return null

      if (await exists(file)) return null

      this.warn(`creating empty file at ${file}`)

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

const after = ({ filter }) => ({
  name: name + ':after',
  async load(id) {
    if (await exists(id)) return null
    if (!filter(id)) return null
    this.warn(
      `recreating empty file at ${id} (module still imported into the bundle)`
    )
    return await writeEmptyFile(id)
  },
})

module.exports = (options = {}) => {
  const { include, exclude, recreate = true } = options
  const filter = createFilter(include, exclude)
  const params = { filter }
  return {
    before: before(params),
    after: recreate ? after(params) : false,
  }
}
