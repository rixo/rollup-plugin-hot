# rollup-plugin-hot

> HMR plugin for Rollup, leveraging SystemJS

**This is just a proof of concept right now. Not ready for production by any measure.**

It's using a [WIP branch](https://github.com/LarsDenBakker/systemjs/tree/reload) of SystemJS (thanks dudes!).

## Work in progress

This is very much a work in progress. Like I'm not even so sure about what should be the next steps. Please chime in if you have any suggestion.

In particular, I don't really know how the forcing to SystemJS format will work, and how this plugin in general will interact with varied other plugins and options in real world setups.

So don't hesitate to report issues with mere success stories about your specific Rollup config, if you feel like it. Or, more likely, with feature requests to support it.

## Try it

```bash
git clone git@github.com:rixo/rollup-plugin-hot.git
# ATTENTION run from the example dir for a quick demo
cd rollup-plugin-hot/example
yarn
yarn dev
```

Load http://localhost:5000 in your browser.

Edit files in `example/src`.

Open http://localhost:5000/stateful.html for an advanced example on how to implement a stateful HMR adapter (you'll find more information about this in [./example/src/stateful/README.md](./example/src/stateful/README.md), and comments in the [./example/src/stateful/hmr-adapter.js](./example/src/stateful/hmr-adapter.js) file).

## Install

```bash
npm install --dev rollup-plugin-hot
```

Or:

```bash
yarn add --dev rollup-plugin-hot
```

## Config

```js
export default {
  output: {
    // supports either dir or file
    dir: 'public', // writes individual modules to public/@hot/
    file: 'public/bundle.js', // ... to public/bundle.js@hot/

    // format will be overridden to 'system' when HMR is running
    format: 'iife',

    // sourcemapping is supported
    sourcemap: true,
  },
  plugins: [
    ...hmr({
      // When false, the plugin will do nothing at all (useful for prod build).
      enabled: true, // Default: true

      // When false, only the dev server will run. The plugin will not mess with
      // your config, your bundle, or transform any code. Only reload the
      // browser when the bundle changes.
      hot: false, // Default: true

      // These two are used to map output filenames to URLs, because Rollup
      // knows about filenames but SystemJS knows about URLs.
      //
      // FS path to public directory
      // NOTE this is only used to compute URLs from FS paths... see mount
      // option bellow if you want to serve static content
      public: 'public', // Default: ''
      // Base URL
      baseUrl: '/', // Default: '/'

      // Change the host / port of the dev server
      port: 12345, // Default: 33440
      host: '0.0.0.0', // Default: 'localhost'
      // Prevent from falling back on a random port if the specified one is
      // already occupied
      randomPortFallback: false, // Default: true

      // Opens the dev server in a new browser tab if set.
      // If Chrome is available on macOS, an attempt will be made to
      // reuse an existing browser tab. Any installed browser may also be specified.
      // E.g., “default“, “chrome”, “firefox”, “brave”. Set “none” or `false` to disable.
      open: 'default', // Default: false

      // Page to navigate to when opening the browser.
      // Will not do anything if open=false.
      // Remember to start with a slash.
      openPage: '/different/page', // Default: baseUrl
      // The hostname & port where the browser tab will be open.
      openHost: 'localhost', // Default: HMR server host
      openPort: '33000', // Default: HMR server port

      // Define different paths that should be proxied, and where they should be proxied to.
      // See https://github.com/villadora/express-http-proxy for configuration options.
      proxy: {
        // Short form:
        '/api/01': 'https://pokeapi.co/api/v1/',
        // With options:
        '/api/02': ['https://pokeapi.co/api/v2/', { proxyReqPathResolver(req) { /* ... */ } }],
      },

      // Serve additional static content: the key is a FS path, the value is
      // the base URL. Static content will always be served _after_ files from
      // the bundle.
      mount: {
        public: '/',
        'relative/path/to/somewhere': '/base-url/',
      },

      // Write bundle files in RAM instead of FS and serve them through the dev
      // server. This is obviously more performant but there may be cross domain
      // issues. Also, for very big apps, this might consume too much memory.
      inMemory: true, // Default: false
      // If you sill want to write do disk when using inMemory.
      write: true, // Default: !inMemory

      // Prevent full reload on HMR errors. HMR updates will keep being applied
      // and, most probably, crash more & more. By changing this, you expose
      // yourself to a very broken HMR experience...
      reload: false,
      // Or fine grained (will be deep merged in the defaults bellow).
      // 'defer' means the reload will happen on the next HMR update.
      reload: {
        // When an HMR update bubbles up beyond an entry point without finding
        // an accept handler
        unaccepted: true,
        // Errors during module initialization (i.e. in your code)
        moduleError: 'defer',
        // HMR specific errors (i.e. errors that happens in HMR accept handlers)
        acceptError: true,
        // Other errors during application of hot update (i.e. most probably in
        // my code -- this plugin)
        error: true,
        // When connection to HMR server is lost, then resumes. This typically
        // means that you've restarted Rollup. HMR could theoretically resume
        // and work correctly, provided nothing has changed on the server (but
        // why restart Rollup if nothing has changed? hence defaults to reload).
        reconnect: true,
      },

      // By default, when an update is not accepted the root modules (i.e. those
      // that have no import parents) are automatically accepted. This means
      // that every module will be hot reloaded. You can turn this off to do
      // a full reload instead.
      //
      // Note: an update is "not accepted" when the whole module tree has been
      // traversed, starting from the changed module, up to the root module(s),
      // and no accept handlers have been found.
      autoAccept: false, // Default: true

      // Clear console after successful HMR updates (Parcel style)
      clearConsole: true, // Default: false

      // --- Advanced ---

      // Defaults to output.file. Must be under public dir.
      // Only used when output.file is set.
      loaderFile: 'public/bundle.js',
    }),
  ],
}
```

## How it works

This plugin leverages SystemJS as a module loader (and reloader!) in the browser, and Rollup's `preserveModules` option (to be able to reload individual modules and not the whole bundle).

The plugin itself fires up a dev server to notify System of the changes than happen in Rollup.

It injects the [SystemJS loader](https://github.com/systemjs/systemjs#2-systemjs-loader) and the HMR runtime in the browser by writing them in place of your entrypoints.

For example, with the following Rollup config:

```js
input: 'src/main.js',
output: {
  file: 'public/bundle.js',
},
plugins: [
  hmr({
    public: 'public',
    baseUrl: '/',
  })
]
```

The plugin will write only HMR machinery in `public/bundle.js` and add a single import at the end, pointing to the module containing your actual code (in the "@hot bundle" directory):

```js
// TODO There should be an option not to inject SystemJS loader for people
//      already using it in their app

... // SystemJS loader

... // HMR runtime

System.import('/bundle.js@hot/main.js')
```

The precise location of the @hot directory changes depending on whether you're using `output.file` (`outputFile.js@hot/`) or `output.dir` (`outputDir/@hot`), and the value of `preserveModules` (entry point renamed to `outputDir/entry@hot.js`) in your Rollup config.

But the main idea is to have a 1:1 mapping between the layout of your source directory and the @hot directory, so that relative imports just work normally. Also, since the plugin never injects anything in modules containing your own code, Rollup generated source maps are also completely unaffected.

There's also a `inMemory` option that stores Rollup's output files to RAM instead of writing them to disk, and serves them through the dev server. It is better for perf and for your HDD, but it can be more subject to cross-origin issues. To be frank, the WebSocket probably already suffers from such issues...

### The "hot API"

One of the very open question of this implementation is what should the "hot API" be like? That is, the API that you use in your application (or most likely a framework specific HMR plugin) to apply HMR update at "app level".

In Webpack, it looks like this:

```js
const previousDisposeData = module.hot.data
module.hot.dispose(data => { ... }) // run a handler on dispose
module.hot.accept(errorHandler) // self-accept HMR updates for this module
module.hot.decline() // reject any update that touches this module
// plus a whole lot more of other things
```

As far as I can tell, Parcel implements a subset of this (`accept`, `dispose`, and status). My guess is that they took what was needed for compatibility of React hot loader or something like this but, truly, I don't know.

What this plugin currently implements is this:

```js
const previousDisposeData = import.meta.hot.data
import.meta.hot.dispose(async data => { ... })
import.meta.hot.accept(async acceptHandler)
import.meta.hot.decline() // MAYBE
import.meta.hot.catch(async errorHandler) // DUNNO
// and that's all
```

We want to use `import.meta` because it's close to the [proposed standard](https://github.com/tc39/proposal-import-meta/#importmeta), and that's probably what you want if you're using Rollup.

This plugin differs from Webpack regarding accept handlers (i.e. callbacks to `module.hot.accept(callback)`). Webpack only runs the callback when there is an error during module update (i.e. they are error handlers), whereas this plugin runs a module's accept handler whenever the module is updated.

My rationale is that accept handlers gives a better control to the HMR client (runtime) over the application of an update. It lets it distinguish between errors that happens during module init (i.e. app code) of those that happens in accept handlers (i.e. HMR specific code).

Furthermore, allowing the handlers to be async gives them more power. For example, a handler can let a component finish an async cleanup phase before replacing it with a new instance. And if that goes catastrophically bad, the HMR client can catch the error and take the most appropriate measures regarding HMR state, full reload, and reporting. If that does not go bad, we still get the "Up to date" signal when the update has really been completely applied.

This gives us better error management & reporting capability overall.

Maybe `decline` and/or `catch` would make sense too, but I'm not so sure.

The plugin already offers a compatibility layer for Nollup with the `compatNollup` option, that transforms code intended for this hot API so that it can be run by Nollup. It makes sense because Nollup is intended to run Rollup config files, of which this plugin could be a part. So a project might want to run both at different times. Or switch from one to the other at some point.

## API

#### import.meta.hot

This is the main object exposing the HMR API. You should test if this object is present before using any other part of the API. If the object is not present, it means that HMR is not currently enabled and any HMR specific code should bail out as fast as possible.

```js
if (import.meta.hot) {
  // HMR specific stuff...
}
```

Note that `import.meta` is (proposed) standard in ES module and you should need no plugin for an ES module aware environment to handle this code.

#### import.meta.hot.data

This object is used to pass data between the old and new version of a module.

The data are provided by the `dispose` handler (see bellow).

On the first run of a module (i.e. initial load, not a HMR update), this object will be undefined (this is to align with webpack, but it bothers me more and more, so it could very well change in the near future, please don't rely on this -- but ensure you don't read from an undefined object, which is what bothers me...).

#### import.meta.hot.dispose(async data => void)

The dispose function is called when the module is about to be replaced. The handler is passed a data object that you can mutate and that will be available to the new version of the module that is being loaded.

```js
if (import.meta.hot) {
  // will be undefined when the first version of the module is initally loaded
  console.log(import.meta.hot.data)

  // restore previous state, or init to 0
  const state = (import.meta.hot.data && import.meta.hot.data.value) || 0

  import.meta.hot.dispose(data => {
    // increment the value on HMR update (for illustration purpose)
    // NOTE mutate the passed data object
    data.value = state + 1
  })
}
```

#### import.meta.hot.accept(function|void)

Accepts HMR updates for this module, optionally passing an accept handler.

If a module has an accept handler, then changes to this module won't trigger a full reload. If the module needs specific work to reflect the code change, it is expected to be handled by the provided accept handler function.

The order of execution when a HMR update happens is as follow:

- the old module's `dispose` handler is called

- the new module is executed

- the old module's `accept` handler is called

```js
// simply accept the HMR update -- just reexecuting the module must be enough to
// reflect any code change, or this will result in a broken app state
import.meta.hot.accept()

// in most case, you'll need to pass
import.meta.hot.accept(({ id, bubbled }) => {
  // id is the id of the updated module
  //
  // bubbled will be true if this handler is called because a HMR update
  // has bubbled up to this module (you cannot conclude that this module has not
  // changed too, though)
  //
  // ... your code to apply the update
})
```

#### import.meta.hot.beforeUpdate and import.meta.hot.afterUpdate

Those are global hooks that are called when a HMR update to any module, before the first `dispose` handler, and after the last `accept` handler.

They can be useful to implement some HMR enhancements. For example, you could save the scroll position before the update and restore it after the update. This is not specific to a particular module, yet it could be influenced by any module update, and the scroll is a singleton resource. So this should be implemented in a central location, which can be done with these hooks.

```js
if (import.meta.hot) {
  let scrollTopBefore = null

  import.meta.hot.beforeUpdate(() => {
    scrollTopBefore = document.body.scrollTop
  })

  import.meta.hot.afterUpdate(() => {
    requestAnimationFrame(() => {
      document.body.scrollTop = scrollTopBefore
    })
  })
}
```

## License

[ISC](LICENSE)
