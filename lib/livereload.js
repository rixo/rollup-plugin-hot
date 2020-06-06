module.exports = ({
  renderRuntimeScript,
  triggerReload,
  hook = 'writeBundle',
}) => ({
  name: `hot (livereload)`,
  banner: renderRuntimeScript,
  [hook]: triggerReload,
})
