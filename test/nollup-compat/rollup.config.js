import defaults from '../rollup.defaults.js'

const nollup = !!process.env.NOLLUP

export default {
  ...defaults,
  input: 'src/main.js',
  output: {
    sourcemap: true,
    format: 'iife',
    file: nollup ? 'bundle.js' : 'public/bundle.js',
  },
}
