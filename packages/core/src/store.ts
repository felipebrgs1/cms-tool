/** Store mínima, sem framework. Adaptadores (React, Solid, Vue...) só precisam de get/subscribe. */
export interface Store<S> {
  get(): S
  set(next: S): void
  subscribe(listener: () => void): () => void
}

export function createStore<S>(initial: S): Store<S> {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      if (next === state) return
      state = next
      listeners.forEach((l) => l())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Histórico por snapshots. Barato porque os documentos são imutáveis com structural sharing (immer). */
export class History<T> {
  private past: T[] = []
  private future: T[] = []

  constructor(private limit = 200) {}

  push(previous: T) {
    this.past.push(previous)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
  }

  undo(current: T): T | undefined {
    const prev = this.past.pop()
    if (prev !== undefined) this.future.push(current)
    return prev
  }

  redo(current: T): T | undefined {
    const next = this.future.pop()
    if (next !== undefined) this.past.push(current)
    return next
  }

  get canUndo() {
    return this.past.length > 0
  }

  get canRedo() {
    return this.future.length > 0
  }
}
