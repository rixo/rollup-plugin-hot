/* eslint-env browser */

class HelloWorld extends HTMLElement {
  // NOTE we cannot have a real constructor, because we cannot replace the
  // constructor of the HMR proxy (can we?); this means that the constructor
  // of the first version of the component will run every time a HMR update
  // happens (so it needs to be empty to avoid problems)
  //
  // constructor should be renamed by a code transform in HMR plugin, since
  // the transformed class does not work without the HMR proxy
  //
  _constructor() {
    // super()
    this.attachShadow({ mode: 'open' })

    /// update the value of message
    /// this.message = "Jane"
  }

  static get observedAttributes() {
    return ['message']
  }

  connectedCallback() {
    for (const prop of this.constructor.observedAttributes) {
      if (this.hasAttribute(prop)) {
        this[prop] = this.getAttribute(prop)
      }
    }
    this.render()
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render()
    }
  }

  get message() {
    return this.getAttribute('message')
  }

  set message(value) {
    this.setAttribute('message', value)
  }

  render() {
    this.shadowRoot.innerHTML = `
      <h1>Hello ${this.message}</h1>
    `
  }
}

const tag = 'hello-world'

if (customElements.get(tag)) {
  // this block runs when the module is re executed after a HMR update

  // we're getting the Proxy that was created when the module was first
  // executed (in the else block that follows)
  const HelloWorldProxy = customElements.get(tag)

  HelloWorldProxy.update(HelloWorld)
} else {
  // this block runs when the module is first executed (initial load)
  //
  // we create a Proxy that we put into the customElements registry, and we
  // try to make this Proxy behaves all like the last version of its component
  //
  // we also need to recompute / rerender all existing instances when a
  // component is updated through HMR
  //

  const instances = []
  let current = HelloWorld.prototype

  // we cannot redefine a custom element with the same name (can we?), so
  // instead of exposing the real component class (that will change with HMR),
  // we're exposing a HMR controlled proxy
  //
  // next challenge will be to make this proxy always behave like the _last_
  // version of a component... and also update state / view of all existing
  // instances when an update happens
  //
  // class HelloWorldProxy extends Object.getPrototypeOf(HelloWorld) {
  class HelloWorldProxy extends HelloWorld {
    constructor(...args) {
      //
      // /!\ we have to call super before accessing this
      //
      // that means the user's new constructor will have run with the wrong
      // prototype :-/
      //
      super(...args)

      // hijack this instance's prototype with the current last version
      if (current !== Object.getPrototypeOf(this)) {
        Object.setPrototypeOf(this, current)
      }

      return this._constructor(...args)
    }

    connectedCallback() {
      // register instance, to be able to update it on change
      instances.push(this)
      // proxy to the current proto's connectedCallback (we can't call it with
      // super because it would always go to the first version of HelloWorld)
      if (current.connectedCallback) {
        return current.connectedCallback.apply(this, arguments)
      }
    }

    disconnectedCallback() {
      const index = instances.findIndex(this)
      instances.splice(index, 1)
      if (current.disconnectedCallback) {
        return current.disconnectedCallback.apply(this, arguments)
      }
    }
  }

  HelloWorldProxy.update = ({ prototype }) => {
    // we can't change HelloWorldProxy's constructor (hence constructor's proto)
    // because it is an ES class (can we?)
    //
    // so instead, we'll store it, and change the prototype of each existing
    // instances and each new instances (that we can)
    //
    current = prototype
    instances.forEach(instance => {
      Object.setPrototypeOf(instance, current)
      //
      // /!\ we have to know how to trigger a rerender of the component
      //
      instance.render()
    })
  }

  customElements.define(tag, HelloWorldProxy)
}
