import * as hot from '@hot'

import { a } from './a'
import B from './b'

const el = document.createElement('pre')

el.innerHTML = `Hello ${B(a)}`

document.body.append(el)

hot.accept()
hot.dispose(() => {
  el.remove()
})
