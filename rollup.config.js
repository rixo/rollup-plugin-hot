import hmr from './lib/hmr'
import * as path from 'path'

export default {
  input: './src/main.js',
  treeshake: false,
  preserveModules: true,
  output: {
    sourcemap: 'inline',
    format: 'system',
    // format: 'esm',
    // format: 'iife',
    // file: 'public/bundle.js',
    dir: 'public/bundle',
  },
  plugins: [
    hmr({
      getUrl: id => '/bundle/' + path.relative(path.join(__dirname, 'src'), id),
    }),
  ],
  watch: {
    clearScreen: false,
  },
}
