import resolve from 'rollup-plugin-node-resolve'

export default {
  input: './src/index.js',
  output: {
    sourcemap: false,
    format: 'iife',
    file: 'dist/hmr-client.js',
  },
  plugins: [
    resolve({
      browser: true,
      // dedupe: importee =>
      //   importee === 'svelte' || importee.startsWith('svelte/'),
    }),
  ],
}
