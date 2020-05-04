import hmr from 'rollup-plugin-hot'
import postcss from 'rollup-plugin-postcss'

// NOTE we're using the same instance of the HMR server to serve our multiple
// builds -- this works because they all use the same public directory, and they
// don't step on each other's toes by trying to write to the same output files
const hot = hmr({
  public: 'public',
  clearConsole: false,
  inMemory: true,
})

export default [
  {
    input: './src/main.js',
    output: {
      sourcemap: true,
      format: 'iife',
      file: 'public/build/bundle.js',
    },
    // our example contains dynamic imports (because we want to test them with
    // HMR!), so we need this option to be able to build to an iife
    inlineDynamicImports: true,
    plugins: [hot],
    watch: {
      clearScreen: false,
    },
  },

  // another example
  {
    input: './src/stateful/main.js',
    output: {
      sourcemap: true,
      format: 'iife',
      file: 'public/build/stateful.js',
    },
    plugins: [hot],
    watch: {
      clearScreen: false,
    },
  },

  // postcss
  {
    input: './src/postcss/main.js',
    output: {
      sourcemap: true,
      format: 'iife',
      file: 'public/build/postcss.js',
    },
    plugins: [postcss(), hot],
    watch: {
      clearScreen: false,
    },
  },
]
