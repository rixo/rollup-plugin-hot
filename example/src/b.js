import { a as az } from './a'

const a = 'b2'

export default (...args) => [a, az, ...args].join(' <-> ')
