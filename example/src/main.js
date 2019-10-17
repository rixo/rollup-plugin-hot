import * as hot from '@hot'

import { a } from './a'
import B from './b'

const el = document.createElement('pre')

el.innerHTML = `Hello ${B(a)}`

document.body.append(el)

// throw new Error()

hot.accept()
hot.dispose(() => {
  el.remove()
})
