import defaults from '../rollup.defaults'

export default {
  ...defaults,
  preserveModules: true,
  output: {
    sourcemap: true,
    format: 'es',
    dir: 'public/bundle',
  },
}
