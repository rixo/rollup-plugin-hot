class HelloWorld extends HTMLElement {

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })

    /// update the value of message
    /// this.message = "Jane"
  }

  static get observedAttributes() {
    return [ 'message' ]
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

//// the if condition doesnt work 
///  when you change/update hello-world component
if (!customElements.get('hello-world')) {
  customElements.define('hello-world', HelloWorld)
}