/* eslint-env browser */

class HelloWorld extends HTMLElement {
  constructor() {
    super()
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
  const HelloWorldProxy = customElements.get(tag)

  // we can't change HelloWorldProxy's constructor (hence constructor's proto)
  // because it is an ES class (can we?)
  //
  // so instead, we'll store it, and change the prototype of each existing
  // instances and each new instances (that we can)
  //
  HelloWorldProxy.current = HelloWorld.prototype

  // rerender instances
  HelloWorldProxy.instances.forEach(instance => {
    Object.setPrototypeOf(instance, HelloWorldProxy.current)
    //
    // /!\ we have to know how to trigger a rerender of the component
    //
    instance.render()
  })
} else {
  // we cannot redefine a custom element with the same name (can we?), so
  // instead of exposing the real component class (that will change with HMR),
  // we're exposing a HMR controlled proxy
  //
  // next challenge will be to make this proxy always behave like the _last_
  // version of a component... and also update state / view of all existing
  // instances when an update happens
  //
  class HelloWorldProxy extends HelloWorld {
    constructor(...args) {
      //
      // /!\ we have to call super before accessing this
      //
      // that means the user's new constructor will have run with the wrong
      // prototype :-/
      //
      super(...args)

      // if there's a current, that means the HelloWorld the proxy is extending
      // is an old version... we need to hijack the prototype with the new one
      // (it would really be better if we could do that _before_ super is called)
      if (HelloWorldProxy.current) {
        Object.setPrototypeOf(this, HelloWorldProxy.current)
      }
    }

    connectedCallback() {
      // register instance, to be able to update it on change
      HelloWorldProxy.instances.push(this)
      super.connectedCallback()
    }

    disconnectedCallback() {
      const index = HelloWorldProxy.instances.findIndex(this)
      HelloWorldProxy.instances.splice(index, 1)
      super.disconnectedCallback()
    }
  }

  // a registry for all instances that are created
  //
  // HelloWorldProxy will reside in memory, and won't be overwritten when HMR
  // runs the new file (thanks to the if condition we're in). that means we can
  // store global state on it.
  //
  HelloWorldProxy.instances = []

  customElements.define(tag, HelloWorldProxy)
}
