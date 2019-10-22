import hmr from 'rollup-plugin-hot'

const firstIf = (test, array) => (test ? array[0] : array)

const hot = true

export default {
  // input: ['./src/main.js', './src/main2.js'],
  input: ['./src/main.js'],
  // it doesn't make sense to generate multiple build formats during dev, it
  // slows things down & make HMR harder, so this is not supported
  output: firstIf(hot, [
    {
      sourcemap: true,
      format: 'iife',
      file: 'public/bundle.js',
    },
    {
      sourcemap: 'inline',
      format: 'umd',
      file: 'public/bundle.umd.js',
    },
  ]),
  plugins: [
    hot &&
      hmr({
        public: 'public',
        clearConsole: false,
        inMemory: true,
        inMemory: false,
      }),
  ],
  watch: {
    clearScreen: false,
  },
}
