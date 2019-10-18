import resolve from 'rollup-plugin-node-resolve'

export default {
  input: './src/index.js',
  output: {
    sourcemap: true,
    format: 'iife',
    file: 'dist/hmr-runtime.js',
  },
  plugins: [
    resolve({
      browser: true,
      // dedupe: importee =>
      //   importee === 'svelte' || importee.startsWith('svelte/'),
    }),
  ],
}
