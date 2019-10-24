const depsMap = {}
const importersMap = {}
const errors = {}

const getImporterEntry = id => {
  const existing = importersMap[id]
  if (!existing) {
    return (importersMap[id] = [])
  }
  return existing
}

// TODO building this reverse lookup map is probably overkill
export const setDeps = (err, id, deps) => {
  if (err) {
    errors[id] = err
  } else {
    delete errors[id]
  }
  if (deps) {
    depsMap[id] = deps
    deps.forEach(dep => {
      const entry = getImporterEntry(dep)
      entry.push(id)
    })
  }
}

export const forgetDeps = id => {
  const deps = depsMap[id]
  if (deps) {
    delete depsMap[id]
    for (const dep of deps) {
      const importerDeps = importersMap[dep]
      if (!importerDeps) continue
      const index = importerDeps.indexOf(id)
      if (index < 0) continue
      importerDeps.splice(index, 1)
    }
  }
}

export const getImporters = id => importersMap[id]

export const getError = id => errors[id]
