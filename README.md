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

## Install

~~~bash
npm install --dev rollup-plugin-hot
~~~

Or:

~~~bash
yarn add --dev rollup-plugin-hot
~~~

## Config

~~~js
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
    ...
    hmr({
      // These two are used to map output filenames to URLs, because Rollup
      // knows about filenames but SystemJS knows about URLs.
      //
      // FS path to public directory
      public: 'public', // Default: ''
      // Base URL
      baseUrl: '/', // Default: '/'

      // Change the port of the dev server
      port: 12345, // Default: 38670

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
      // Or fine grained (will be deep merged in the bellow defaults)
      reload: {
        moduleError: 'defer',
        acceptError: true,
        error: true,
      }

      // By default, when an update is not accepted the root modules (i.e. those
      // that have no import parents) are automatically accepted. This means
      // that every module will be hot reloaded. You can turn this off to do
      // a full reload instead.
      //
      // Note: an update is "not accepted" when the whole module tree has been
      // traversed, starting from the changed module, up to the root module(s),
      // and no accept handlers have been registered.
      autoAccept: false, // Default: true

      // Clear console after successful HMR updates (Parcel style)
      clearConsole: true, // Default: false

      // --- Advanced ---

      // Defaults to output.file. Must be under public dir.
      // Only used when output.file is set.
      loaderFile: 'public/bundle.js',
    })
  ]
}
~~~

## How it works

This plugin leverages SystemJS as a module loader (and reloader!) in the browser, and Rollup's `preserveModules` option (to be able to reload individual modules and not the whole bundle).

The plugin itself fires up a dev server to notify System of the changes than happen in Rollup.

It injects the [SystemJS loader](https://github.com/systemjs/systemjs#2-systemjs-loader) and the HMR runtime in the browser by writing them in place of your entrypoints.

For example, with the following Rollup config:

~~~js
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
~~~

The plugin will write only HMR machinery in `public/bundle.js` and add a single import at the end, pointing to the module containing your actual code (in the "@hot bundle" directory):

~~~js
// TODO There should be an option not to inject SystemJS loader for people
//      already using it in their app

... // SystemJS loader

... // HMR runtime

System.import('/bundle.js@hot/main.js')
~~~

The precise location of the @hot directory changes depending on whether you're using `output.file` (`outputFile.js@hot/`) or `output.dir` (`outputDir/@hot`), and the value of `preserveModules` (entry point renamed to `outputDir/entry@hot.js`) in your Rollup config.

But the main idea is to have a 1:1 mapping between the layout of your source directory and the @hot directory, so that relative imports just work normally. Also, since the plugin never injects anything in modules containing your own code, Rollup generated source maps are also completely unaffected.

There's also a `inMemory` option that stores Rollup's output files to RAM instead of writing them to disk, and serves them through the dev server. It is better for perf and for your HDD, but it can be more subject to cross-origin issues. To be frank, the WebSocket probably already suffers from such issues...

### The "hot API"

One of the very open question of this implementation is what should the "hot API" be like? That is, the API that you use in your application (or most likely a framework specific HMR plugin) to apply HMR update at "app level".

In Webpack, it looks like this:

~~~js
const previousDisposeData = module.hot.data
module.hot.dispose(data => { ... }) // run a handler on dispose
module.hot.accept(errorHandler) // self-accept HMR updates for this module
module.hot.decline() // reject any update that touches this module
// plus a whole lot more of other things
~~~

As far as I can tell, Parcel implements a subset of this (`accept`, `dispose`, and status). My guess is that they took what was needed for compatibility of React hot loader or something like this but, truly, I don't know.

What this plugin currently implements is this:

~~~js
const previousDisposeData = import.meta.hot.data
import.meta.hot.dispose(async data => { ... })
import.meta.hot.accept(async acceptHandler)
import.meta.hot.decline() // MAYBE
import.meta.hot.catch(async errorHandler) // DUNNO
// and that's all
~~~

We want to use `import.meta` because it's close to the [proposed standard](https://github.com/tc39/proposal-import-meta/#importmeta), and that's probably what you want if you're using Rollup.

This plugin differs from Webpack regarding accept handlers (i.e. callbacks to `module.hot.accept(callback)`). Webpack only runs the callback when there is an error during module update (i.e. they are error handlers), whereas this plugin runs a module's accept handler whenever the module is updated.

My rationale is that accept handlers gives a better control to the HMR client (runtime) over the application of an update. It lets it distinguish between errors that happens during module init (i.e. app code) of those that happens in accept handlers (i.e. HMR specific code).

Furthermore, allowing the handlers to be async gives them more power. For example, a handler can let a component finish an async cleanup phase before replacing it with a new instance. And if that goes catastrophically bad, the HMR client can catch the error and take the most appropriate measures regarding HMR state, full reload, and reporting. If that does not go bad, we still get the "Up to date" signal when the update has really been completely applied.

This gives us better error management & reporting capability overall.

Maybe `decline` and/or `catch` would make sense too, but I'm not so sure.

The plugin already offers a compatibility layer for Nollup with the `compatNollup` option, that transforms code intended for this hot API so that it can be run by Nollup. It makes sense because Nollup is intended to run Rollup config files, of which this plugin could be a part. So a project might want to run both at different times. Or switch from one to the other at some point.

## License

[ISC](LICENSE)
