import defaults from '../rollup.defaults'

export default {
  ...defaults,
  input: ['../src/main.js', '../src/main2.js'],
  output: {
    sourcemap: true,
    format: 'es',
    dir: 'public/bundle',
  },
}
