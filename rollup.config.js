import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import { terser } from 'rollup-plugin-terser'

export default {
  input: './src/main.js',
  output: {
    sourcemap: true,
    format: 'iife',
    file: 'dist/hmr-runtime.js',
  },
  plugins: [
    resolve({
      browser: true,
    }),
    commonjs({
      include: 'lib/constants.js',
    }),
    terser({
      compress: {
        drop_debugger: false,
      },
    }),
  ],
}
