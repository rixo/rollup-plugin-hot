import { a } from './a'
import B from './b'

const el = document.createElement('pre')

// el.innerHTML = `Hello ${B(a)}`
B(a).then(x => {
  el.innerHTML = `Hello ${x}!!!`
})

document.body.append(el)

// throw new Error('boom')

if (import.meta.hot.data) {
  const { el } = import.meta.hot.data
  el.remove()
}

import.meta.hot.accept()

import.meta.hot.dispose(data => {
  data.el = el
})
