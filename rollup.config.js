export default {
  input: './src/index.js',
  output: {
    sourcemap: false,
    format: 'iife',
    file: 'hmr-client.js',
  },
}
