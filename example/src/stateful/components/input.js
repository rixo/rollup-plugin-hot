import withHmr from '../hmr-adapter.js'

const Input = (target, { type = 'text', label, value }) => {
  if (typeof target === 'string') target = document.querySelector(target)

  target.innerHTML = `
    <label>
      <span style="font-weight: bold"></span>
      <input />
    </label>
  `

  const span = target.querySelector('span')
  const input = target.querySelector('input')

  const update = () => {
    span.innerHTML = label
    input.type = type
    input.value = value || ''
  }

  const getState = () => ({
    type,
    label,
    value: input.value,
  })

  const destroy = () => {
    target.innerHTML = ''
  }

  update()

  return {
    destroy,
    getState,
    get value() {
      return type === 'number' ? parseInt(input.value) : input.value
    },
    set value(value) {
      input.value = value
    },
  }
}

export default withHmr(import.meta.hot, Input)
