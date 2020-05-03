import Button from './components/button.js'
import Input from './components/input.js'

document.body.innerHTML = `
  <h1>Stateful HMR example</h1>

  <h2>Change me?</h2>

  <div id="input1"></div>

  <div id="input2"></div>

  <div id="button"></div>
`

Input('#input1', { label: 'Input 1' })

// the value of this input will be preserved
const input = Input('#input2', { label: 'Input 2', type: 'number', value: 3 })

const onClick = () => {
  // NOTE we can do that because the input2 reference is a HMR proxy, it will
  // never change, even when the Input component is updated
  input.value += 1
}

// the state of this button (click counter) will be preserved
Button('#button', { label: 'Click click', onClick })

// this module can be hot reloaded without any extra work, so we simply accept
// HMR updates to avoid a full reload when editing this module
//
// this works in this case because our "render" strategy consist of replacing
// the whole content of the body, so a new module will effectively destroy the
// previous instance transparently
//
// NOTE however all child components (inputs, button) will be recreated in the
// operation, so an update to this module will lose state of all children --
// this is hardly avoidable, generally all children will be recreated when a
// parent is recreated. when the code/framework is highly declarative, meaning
// the children actually have little to no internal state, this has little to
// no visible effects -- but here the state is stored in the children
//
if (import.meta.hot) {
  import.meta.hot.accept()
}
