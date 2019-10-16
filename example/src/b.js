import { a as az } from './a'

const a = 'b2'

export default (...args) => `B( ${[a, az, ...args].join(' | ')} )`
