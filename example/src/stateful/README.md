# Stateful HMR example

This example demonstrates the basics of a stateful HMR adapter.

For illustration, we're using a dumb component framework where components are defined as functions with signature:

```js
(target, state) => ({ getState, destroy })
```

This formalism allows us to write a generic HMR adapter for this kind of components.

The HMR adapter is implemented in the `hmr-adapter.js` module. This is typically the kind of adapter that is provided by a lib like React Hot Reload, or Svelte HMR.

Generally the adapter is transparently applied to your code by a transform plugin in the bundler (e.g. React Hot Loader, rollup-plugin-svelte-hot). In our case we're doing the wiring manually by directly wrapping all our components with our adapter function:

```js
import withHmr from '../hmr-adapter.js'

const Cmp = ...

withHmr(import.meta.hot, Cmp)
```

Our HMR adapter function receives 2 things: the `import.meta.hot` object **from the module it will wrap**, and the component's constructor.

Very importantly, our HMR adapter has something else: the intimate knowledge of the inner working of a Component in our target framework. While hot module replacement works at a very abstract level, executing and rewiring ES modules with no idea of what they do, the HMR adapters are on the other end of the spectrum. They know only of the specificity of a given framework, and have all their focus on a single operation: how to replace and existing component with a new version of this component, all while preserving the maximum of relevant pieces of state between them. The challenge is that a "same" component may be completely different before and after a HMR update... That's why a generic HMR adapter can only be written for a specific component framework, with a very well defined component formalism (this can totally be your own custom framework though, if it fulfill the formalism condition).

Appart from applying HMR updates to existing instance of our component, our HMR adapter will also replace direct references with a proxy object. Meaning, it won't let the other module see the actual instances of the components it creates. This is needed because these references will be stored somewhere else in the application, and our HMR adapter will have no control to change their content when an update happen. So we return an object that proxies to the actual last instance of the component we've created, and that is stored internally in the HMR adapter.

In order to experiment with this HMR implementation, change the code in the "templates" of our wrapped component (i.e. `button.js` and `input.js`):

```js
target.innerHTML = `
  <button></button>
  <span></span>
`
```

You'll see that the markup is updated, while the internal state (e.g. the value of the "Input 2", or the click counter of the button) of the component is preserved.

If you update the Input component, you'll also see that the click handler remains hooked to the current (replaced) instance of the "Input 2" component. This is the work of the HMR proxy.

For the details of the implementation of the HMR adapter, see the code of [`hmr-adapter.js`](./hmr-adapter.js), where everything is abundantly commented.

Don't be surprised if you don't get it at the first reading. The HMR workflow is extremly unintuitive, because it is very different to the normal execution flow of a module. In particular, the code in a single module (file) will run multiple times, and the code of the accept / dispose handlers will run in a scope from the past, with access to data from the future. This is mind boggling and very hard to reason about. Even for me, after writing a full featured HMR adapter for Svelte and implemented a full fledged HMR plugin and API (this plugin), the execution flow remains far from natural, and I still have to take it very slowly when I work on it.

That being said, there aren't so many moving parts, so it is actually possible to understand and reason about, once you've identified the tricky parts. Just don't despair, and accept that it may take a few days of experimenting and reflecting about it, for it to sink and everything to come together ;)

Have fun with HMR!
