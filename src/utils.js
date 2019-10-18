export const serial = handler => {
  let promise
  return () => (promise = promise ? promise.then(handler) : handler())
}
