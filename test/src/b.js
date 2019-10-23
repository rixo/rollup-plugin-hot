import { a as az } from './a'

const a = 'B:' + az

export default async (...args) => {
  const { c } = await import('./c')
  return `B( ${[a, az, c, ...args].join(' | ')} )`
}
