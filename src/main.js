import hot from '@@hot'

import A, { a } from './a'
import B from './b'

console.log('main >>>', B(a))

hot.accept()
