import hmr from 'rollup-plugin-hot'
import * as path from 'path'

export default {
  input: './src/main.js',
  output: {
    sourcemap: 'inline',
    format: 'iife',
    // file: 'public/bundle.js',
    dir: 'public/bundle',
  },
  plugins: [
    hmr({
      hot: true,
      baseUrl: '/bundle/',
    }),
  ],
  watch: {
    clearScreen: false,
  },
}
