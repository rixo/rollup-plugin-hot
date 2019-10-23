import defaults from '../rollup.defaults'

export default {
  ...defaults,
  output: {
    sourcemap: true,
    format: 'iife',
    dir: 'public',
  },
}
