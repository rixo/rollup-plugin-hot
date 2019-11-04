import hmr from 'rollup-plugin-hot'

export const nollup = !!process.env.NOLLUP
export const production = !nollup && !process.env.ROLLUP_WATCH
export const hot = !production

export default {
  input: '../src/main.js',
  output: {
    sourcemap: true,
    format: 'es',
  },
  plugins: [
    hmr({
      enabled: hot,
      compatNollup: nollup,
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
