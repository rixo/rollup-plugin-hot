import hmr from 'rollup-plugin-hot'

export const production = !process.env.ROLLUP_WATCH
export const hot = !production

export default {
  input: '../src/main.js',
  output: {
    sourcemap: true,
    format: 'es',
  },
  plugins: [
    hot &&
      hmr({
        public: 'public',
        clearConsole: false,
        inMemory: true,
        write: true,
        verbose: false,
      }),
  ],
  watch: {
    clearScreen: false,
  },
}
