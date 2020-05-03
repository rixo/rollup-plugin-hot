import withHmr from '../hmr-adapter.js'

const Button = (target, { label, count = 0, onClick }) => {
  if (typeof target === 'string') target = document.querySelector(target)

  target.innerHTML = `
    <button></button>
    <span></span>
  `

  const el = target.querySelector('button')
  const counter = target.querySelector('span')

  el.addEventListener('click', () => {
    count++
    update()
    if (onClick) onClick()
  })

  const update = () => {
    el.innerHTML = label
    counter.innerHTML = `(${count})`
  }

  const getState = () => ({ label, count, onClick })

  update({ label })

  const destroy = () => {
    target.innerHTML = ''
  }

  return { getState, destroy }
}

export default withHmr(import.meta.hot, Button)
