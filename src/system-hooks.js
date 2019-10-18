export default ({ hot, setDeps }) => {
  const proto = System.constructor.prototype

  const createContext = proto.createContext
  proto.createContext = function(...args) {
    const [url] = args
    return {
      ...createContext.apply(this, args),
      hot: { id: url, ...hot },
    }
  }

  const onload = proto.onload
  proto.onload = function(...args) {
    const [err, id, deps] = args
    if (!err) {
      setDeps(id, deps)
    }
    return onload.apply(this, args)
  }
}
