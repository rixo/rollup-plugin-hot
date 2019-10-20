import { a } from './a'
import B from './b'

const el = document.createElement('pre')

// el.innerHTML = `Hello ${B(a)}`
B(a).then(x => {
  el.innerHTML = `Hello ${x}`
})

document.body.append(el)

// throw new Error()

// Funnily, this works:
//
// import('./a')
// module.meta.hot.accept()
// module.meta.hot.dispose(() => {
//   el.remove()
// })

// import.meta.hot.catch(err => {
//   throw err
// })

import.meta.hot.accept()

import.meta.hot.dispose(() => {
  el.remove()
})
