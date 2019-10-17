import { a } from './a'
import B from './b'

const el = document.createElement('pre')

el.innerHTML = `Hello ${B(a)}`

document.body.append(el)

// throw new Error()

// Funnily, this works:
//
// import('./a')
// module.meta.accept()
// module.meta.dispose(() => {
//   el.remove()
// })

import.meta.accept()
import.meta.dispose(() => {
  el.remove()
})
