import { a as az } from './a'

const a = 'B:' + az

export default async (...args) => {
  const { c } = await import('./sub/c')
  return `B( ${[a, az, c, ...args].join(' | ')} )`
}
