import defaults from '../rollup.defaults'

export default {
  ...defaults,
  output: {
    sourcemap: true,
    format: 'iife',
    file: 'public/bundle.js',
  },
}
