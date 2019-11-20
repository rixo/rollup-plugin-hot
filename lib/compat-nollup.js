const { createFilter } = require('rollup-pluginutils')
const { posixify } = require('./utils')

const name = 'hot-compat-nollup'

const IS_COMPAT_NOLLUP = Symbol('IS_COMPAT_NOLLUP')

const isCompatNollup = plugin => !!(plugin.$ && plugin.$[IS_COMPAT_NOLLUP])

// transform plugin that rewrites import.meta.hot to Nollup's API
function CompatNollup({
  parent = '',
  include = /\.(?:js|svelte)$/,
  exclude,
} = {}) {
  const compatPath = posixify(require.resolve('./compat-nollup.runtime.js'))

  // to help people understand their generated rollup config,
  // when they inspect it for debug
  const addedBy = []

  const addParent = p => {
    addedBy.push(p)
    updateName()
  }

  const filters = [createFilter(include, exclude)]

  const filter = x => filters.some(filter => filter(x))

  const addFilter = (parentName, include, exclude) => {
    filters.push(createFilter(include, exclude))
    addParent(parentName)
  }

  const updateName = () => {
    if (addedBy.length > 0) {
      plugin.name = `${name} (added by: ${addedBy.join(', ')})`
    } else {
      plugin.name = name
    }
  }

  const splitFirstLine = code => {
    const eolIndex = code.indexOf('\n')
    if (eolIndex === -1) {
      return ['', '', code]
    }
    const firstLine = code.slice(0, eolIndex)
    if (/\bimport\.meta\b/.test(firstLine)) {
      return [firstLine, code.slice(eolIndex + 1), '']
    }
    return [firstLine, '', code.slice(eolIndex + 1)]
  }

  const plugin = {
    name,
    transform(source, id) {
      if (id === compatPath) return null
      if (!filter(id)) return null
      if (!/\bimport\.meta\b/.test(source)) return null
      const [before, after, rest] = splitFirstLine(source)
      // We're trying to put our import/init at the end of the first line (only
      // possible if the first line doesn't contains import.meta, let's call
      // that ok in most cases)... This way, we're not moving any code, and can
      // skip the sourcemap.
      const code = [
        [
          before,
          `import __compatNollup__ from '${compatPath}'; `,
          // NOTE: 'ïmpørt_mêtä'.length === 'import.meta'.length
          `const impørt_mêtä = { hot: __compatNollup__(module) };`,
          after,
        ]
          .filter(Boolean)
          .join(''),
        rest,
      ]
        .join('\n')
        .replace(/\bimport.meta\b/g, 'impørt_mêtä')
      return { code, map: null }
    },
    // plugin API (i.e. non rollup hook things)
    $: {
      [IS_COMPAT_NOLLUP]: true,
      addedBy,
      addFilter,
    },
  }

  if (parent) {
    addParent(parent)
  }

  return plugin
}

// append CompatNollup plugin at the end of existing plugins
//
// dedups if there is already a CompatNollup plugin in there: only adds the
// include/exclude filter, and move the existing plugin at the end
//
// dedup is needed because applying the plugin's transform twice would result
// in duplicated imports and binding names (dup filters are still not super,
// but it's preferable to avoid the crash at a minimal processing cost than
// overcomplexifying or requiring the user to understand it all)
//
// for reference: rollup-plugin-svelte-hot calls this function for interop with
// svelte-hmr, that's why the risk of dups is so important
//
const appendCompatNollup = (parent, cfg) => options => {
  const { plugins: initialPlugins = [] } = options
  const existingIndex = initialPlugins.findIndex(isCompatNollup)
  if (existingIndex === -1) {
    return {
      ...options,
      plugins: [...initialPlugins, CompatNollup({ parent, ...cfg })],
    }
  }
  const existing = initialPlugins[existingIndex]
  const { include, exclude } = cfg
  existing.$.addFilter(parent, include, exclude)
  // move to the end
  if (existingIndex === initialPlugins.length - 1) {
    return options
  }
  const plugins = [...initialPlugins]
  plugins.splice(existingIndex, 1)
  plugins.push(existing)
  return { ...options, plugins }
}

module.exports = Object.assign(CompatNollup, {
  appendCompatNollup,
})
