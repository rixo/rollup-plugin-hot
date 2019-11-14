const { createFilter } = require('rollup-pluginutils')

const name = 'hot-compat-nollup'

const IS_COMPAT_NOLLUP = Symbol('IS_COMPAT_NOLLUP')

const isCompatNollup = plugin => !!plugin[IS_COMPAT_NOLLUP]

// transform plugin that rewrites import.meta.hot to Nollup's API
function CompatNollup({
  parent = '',
  include = /\.(?:js|svelte)$/,
  exclude,
} = {}) {
  const compatPath = require.resolve('./compat-nollup.runtime.js')

  // to help people understand their generated rollup config,
  // when they inspect it for debug
  const addedBy = []

  const addParent = p => {
    addedBy.push(p)
    updateName()
  }

  const filters = [createFilter(include, exclude)]

  const filter = x => filters.some(filter => filter(x))

  const addFilter = (parentName, ...args) => {
    filters.push(createFilter(...args))
    addParent(parentName)
  }

  const updateName = () => {
    if (addedBy.length > 0) {
      plugin.name = `${name} (added by: ${addedBy.join(', ')})`
    } else {
      plugin.name = name
    }
  }

  const plugin = {
    [IS_COMPAT_NOLLUP]: true,
    name,
    transform(source, id) {
      if (id === compatPath) return null
      if (!filter(id)) return null
      let code = source
      code =
        [
          `import __compatNollup from '${compatPath}';`,
          `const __import_meta_hot = __compatNollup(module);`,
          `const __import_meta = { hot: __import_meta_hot };`,
        ].join(' ') + code
      code = code.replace(/\bimport.meta.hot\b/g, '__import_meta_hot')
      code = code.replace(/\bimport.meta\b/g, '__import_meta')
      // TODO sourcemap (magicstring)
      return { code, map: null }
    },
    // plugin API (i.e. non rollup hook things)
    $: {
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
// in duplicated imports and binding names
//
const appendCompatNollup = (parentName, cfg) => options => {
  const { plugins: initialPlugins = [] } = options
  const existingIndex = initialPlugins.findIndex(isCompatNollup)
  if (existingIndex !== -1) {
    const existing = initialPlugins[existingIndex]
    existing.$.addFilter(parentName, cfg)
    if (existingIndex === initialPlugins.length - 1) {
      return options
    }
    const plugins = [...initialPlugins]
    plugins.splice(existingIndex, 1)
    plugins.push(existing)
    return { ...options, plugins }
  } else {
    return {
      ...options,
      plugins: [...initialPlugins, CompatNollup(cfg)],
    }
  }
}

module.exports = Object.assign(CompatNollup, {
  appendCompatNollup,
})
