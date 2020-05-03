/**
 * This function produces a HMR adapter for our specific type of dumb component,
 * with a signature of (target, state) => ({ destroy, getState }).
 *
 * This wrapper receives the import.meta.hot object _of the target module_, and
 * the Cmp constructor/factory from _the current_ version of the module (that
 * is, the last version of the module that have been executed).
 */
export default (hot, Cmp) => {
  if (!hot) return Cmp

  // our global HMR registry
  //
  // we want a single registry for each wrapped module (e.g. button, input), but
  // we want a specific registry for each module. Indeed, when the button module
  // will be updated, we'll want to update all existing instance of button, but
  // not of input
  //
  // to achieve this, we're storying the hmrState object on the
  // import.meta.hot.data object. This object is updated when the module is
  // disposed, and the value is made accessible (by HMR API) when a new version
  // of a module is executed
  //
  // if `hot.data && hot.data.hmrState` is undefined, that means that we are in
  // the first initial load of the module, and so we create a new registry
  //
  const hmrState = (hot.data && hot.data.hmrState) || { instances: [] }

  // when the target module is disposed (meaning it is in the process of being
  // replaced with a new version), we store our existing registry on the
  // import.meta.hot.data object
  //
  // dispose is called before the new version of the module is executed, and
  // when it will be executed, it will be able to get the existing registry (as
  // is done just above)
  //
  hot.dispose(data => {
    data.hmrState = hmrState
  })

  // we need to store the current (last) version of the Cmp in the registry, for
  // 2 reasons
  //
  // - we will need it in our "HMR wrapped" component (i.e. the function we're
  //   returning from this helper) to create new instances of the component with
  //   the last version of the component
  //
  // - we will need it in the accept handler, to recreate existing instances
  //   with the new version
  //
  // WARNING this will blow your mind, buckle up!
  //
  // it is very important to understand the timing and scopes of all the parts
  // involved here, because what you have just before your eyes might be
  // deceiving...
  //
  // the handler function passed to `import.meta.hot.accept` was defined when
  // the last version of the module was executed. when the handler will be
  // called, meaning a new version of the module has been executed, the scope
  // around the handler that is called _will still be the old module_.
  //
  // however, the new version of the module will have already run, and so the
  // line just bellow will have changed hmrState.Cmp to the last version of the
  // component
  //
  // the old accept handler will still see the old Cmp in the scope, but it can
  // use the new version from hmrState.Cmp to replace all known instances (also
  // stored in hmrState, in hmtState.instances) of the component with a new
  // version
  //
  // the accept handler is also the place where you would transfer existing
  // state of the old instances to the new one that we replace them with. this
  // part is very framework specific though; in our example, we use getState to
  // save the component's state before destroying it, and pass this state to
  // initialize the new version we're creating
  //
  // summary of the order of execution when a HMR update happens:
  //
  // - the dispose handler of the old module is called
  // - the new module is executed
  // - the accept handler of the old module is called
  //
  hmrState.Cmp = Cmp

  // the accept handler plays 2 roles
  //
  // the first one is simply to make the target module (e.g. the button or
  // input components) HMR compatible. a change to a module that has no accept
  // handler would result in a full reload (actually, the update would bubble up
  // through parents / importers, and could be accepted there instead -- if the
  // update bubbles up to the entry module, through any importer, then the
  // update will trigger a full reload).
  //
  // since we're accepting the HMR update, our second task is to make sure that
  // the update is accurately reflected in the rest of the application. this
  // means, first, to update all existing instances of our component
  //
  hot.accept(() => {
    // using last version of the Cmp, and all known instances stored in global
    // hmrState
    const { Cmp, instances } = hmrState

    // replace all existing instances of the component
    instances.forEach(instance => {
      const { cmp } = instance

      // we're saving the existing state (e.g. value...) just before replacing,
      // to transfer it to the new instance
      const state = cmp.getState()

      cmp.destroy()

      // we're keeping a reference to the last instance of each instance of our
      // component in the registry -- note: this is the instance prop, from the
      // instances array in our unique hmrState object
      instance.cmp = Cmp(instance.target, state)
    })
  })

  // this is what other module will receive when they import from our wrapped
  // module -- this is the case because our target modules all do:
  //
  //     export default withHmr(import.meta.hot, TargetComponent)
  //
  // withHmr is the current function we're inside, and its return value (bellow)
  // is what will actually be exported by our target modules
  //
  // it is very important to understand that, since we're accepting the update
  // immediately (i.e. don't let it bubble up), importer modules won't have
  // their imported binding updated -- they will keep using the function they
  // first received
  //
  // side note: when using dynamic imports, if another module was imported first
  // after several HMR updates of our target module, and this other module
  // imports our target module, then it would receive the last version of the
  // function bellow...
  //
  // this side node is interesting but not so much relevant... what this all
  // means is that we must make sure that all versions of the wrapped function
  // bellow always works to produce the last version of our wrapped component
  //
  // this is done by relying only on state / data stored in the hmrState object
  //
  // if you reread the whole code of this HMR adapter and think about the whole
  // lifecycle of everything, you'll realize that our hmrState is only created
  // once and, everywhere & anytime, it always points to _the same object
  // reference_. this means that, from any piece of code, we can get the last
  // up to date information from this object.
  //
  // NOTE to reiterate, the function we're returning bellow is what other
  // modules will see as "a component". they expect to receive what would
  // normally be returned by a component module, without HMR. this means what
  // we're doing here is replicating the behaviour of our wrapped component and,
  // additionnaly, we're storing the information that we'll need to replace
  // existing instances if a HMR update arrives for our target component
  //
  return (target, ...args) => {
    // we want to be sure to always rerender to the same target DOM element, so
    // we're resolving the target immediately -- this is an example of how a
    // HMR adapter _has to_ have an intimate knowledge of the inner workings of
    // the components it's wrapping
    if (typeof target === 'string') target = document.querySelector(target)

    // we're using _the last version_ of our Cmp to create a new instance
    const cmp = hmrState.Cmp(target, ...args)

    // a HMR instance state: we need the current component instance (cmp), and
    // the DOM target where we'll need to rerender updated versions of the
    // component
    const instance = { cmp, target }

    // we store our instance in a global registry; this registry will be passed
    // between the old and new version of a module through the import.meta.data
    // object
    hmrState.instances.push(instance)

    // we also need to wrap the component's destroy method, to remove our
    // current instance from the registry when needed
    const destroy = (...args) => {
      // remove from the registry
      hmrState.instance.splice(hmrState.instances.findIndex(instance), 1)

      // actually destroy the last instance of the component
      return instance.cmp.destroy(...args)
    }

    // we return a proxy instead of directly the actual cmp instance, because
    // the cmp instance will change with each HMR updates
    //
    // the goal of the proxy is to emulate the component API (in our example,
    // it is the cmp.value prop) and pass calls through to the current actual
    // instance, that is stored in instance.cmp, and updated on each HMR update
    //
    // in this case, we're having it easy, because our components are very
    // simple and can be wrapped in a Proxy object... sometimes your components
    // are ES classes and can't easily be wrapped this way, or the Proxy object
    // is not an option (for browser support)... HMR proxies implementation can
    // get hairy!
    //
    const proxy = new Proxy(
      {},
      {
        get(target, prop) {
          // we don't want to expose the real destroy method of the component,
          // or this would bypass our HMR cleaning job
          if (prop === 'destroy') return destroy

          // for anything else, return the actual prop/method from the current
          // component instance
          return instance.cmp[prop]
        },

        // same for setter: proxy everything
        set(target, prop, value) {
          instance.cmp[prop] = value
          return true
        },
      }
    )

    return proxy
  }
}
