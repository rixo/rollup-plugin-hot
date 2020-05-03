import { a } from './a'
import B from './b'

const el = document.createElement('pre')

// el.innerHTML = `Hello ${B(a)}`
B(a).then(x => {
  el.innerHTML = `Hello ${x}!!!`
})

document.body.append(el)

// throw new Error('boom')

// `import.meta` is (proposed) ES standard: this test should work in ES enabled
// environment, even when the hot plugin is not here (obviously, import.meta.hot
// will be falsy in this case, and this HMR-specific block will be skipped)
if (import.meta.hot) {
  // on hot updates, remove the previous element
  //
  // NOTE this code is executed each time the module is loaded. On first run,
  // import.meta.hot.data will be undefined. On subsequent run, it will know of
  // the existing element, because it has been saved in the hot.dispose handler.
  //
  if (import.meta.hot.data) {
    const { el } = import.meta.hot.data
    el.remove()
  }

  // accept hot updates (without any special treatment)
  import.meta.hot.accept()

  import.meta.hot.dispose(data => {
    data.el = el
  })
}
