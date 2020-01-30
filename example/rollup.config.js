import hmr from 'rollup-plugin-hot'

const firstIf = (test, array) => (test ? array[0] : array)

const hot = true

export default {
  input: './src/hello-world.js',
  output: {
    sourcemap: true,
    format: 'iife',
    file: 'public/bundle.js',
  },
  plugins: [
    hot &&
      hmr({
        public: 'public',
        clearConsole: false,
        inMemory: true,
      }),
  ],
  watch: {
    clearScreen: false,
  },
}
