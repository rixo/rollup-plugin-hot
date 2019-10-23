import { a } from './a'
import B from './b'

const el = document.createElement('pre')

B(a).then(x => {
  el.innerHTML = `Hello ${x}`
})

document.body.append(el)

// throw new Error()

import.meta.hot.accept()

import.meta.hot.dispose(() => {
  el.remove()
})
