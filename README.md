# rollup-plugin-hot

> HMR plugin for Rollup, leveraging SystemJS

**This is just a proof of concept right now. Not ready for production by any means.**

It's using a [WIP branch](https://github.com/LarsDenBakker/systemjs/tree/reload) of SystemJS (thanks dudes!).

## Usage

**ATTENTION** Install & run from the `example` directory for a demo (otherwise you'll just build the plugin's files).

```bash
git clone git@github.com:rixo/rollup-plugin-hot.git
cd rollup-plugin-hot/example
yarn
yarn dev
```

Load http://localhost:5000 in your browser.

Edit files in `example/src`.

## Config

~~~js
export default {
  input: '',
  output: {
    file: 'public/bundle.js',
    sourcemap: 'inline',
  },
  plugins: [
    ...
    hmr({
      // Enable / disable
      hot: true,
      // Absolute path (or relative to cwd) of public directory. Used to map
      // output filenames to URL.
      public: 'public',
      // Base URL
      baseUrl: '/',
      // Clear console after successful HMR updates
      clearConsole: false,

      // --- Advanced ---

      // Defaults to output.file. Must be under public dir.
      loaderFile: 'public/bundle.js',
    })
  ]
}
~~~
