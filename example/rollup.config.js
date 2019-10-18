import hmr from 'rollup-plugin-hot'

export default {
  input: './src/main.js',
  output: {
    sourcemap: 'inline',
    format: 'iife',
    file: 'public/bundle.js',
  },
  plugins: [
    hmr({
      hot: true,
      public: 'public',
      clearConsole: false,
    }),
  ],
  watch: {
    clearScreen: false,
  },
}
