module.exports = ({
  name = 'hot compat nollup',
  include = id => /\.(js|svelte)$/.test(id),
}) => {
  const compatPath = require.resolve('./compat-nollup.runtime.js')
  return {
    name,
    transform(code, id) {
      if (include(id) && id !== compatPath) {
        code =
          [
            `import __compatNollup from '${compatPath}';`,
            `const __import_meta_hot = __compatNollup(module);`,
            `const __import_meta = { hot: __import_meta_hot };`,
          ].join(' ') + code
        code = code.replace(/\bimport.meta.hot\b/g, '__import_meta_hot')
        code = code.replace(/\bimport.meta\b/g, '__import_meta')
        return { code, map: null }
      }
      return null
    },
  }
}
