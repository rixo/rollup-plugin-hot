import { setDeps } from './deps-map'
import { createHotContext } from './hot'

export default () => {
  const proto = System.constructor.prototype

  const createContext = proto.createContext
  proto.createContext = function(...args) {
    const [url] = args
    return {
      ...createContext.apply(this, args),
      hot: createHotContext(url),
    }
  }

  const onload = proto.onload
  proto.onload = function(...args) {
    const [err, id, deps] = args
    setDeps(err, id, deps)
    return onload.apply(this, args)
  }
}
