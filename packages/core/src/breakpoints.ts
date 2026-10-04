import { produce } from 'immer'
import type { Breakpoint, Doc, Layout, Node, NodeId, NodeOverride, NodePatch, Style } from './types'

export const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { id: 'desktop', name: 'Desktop', width: 1280, maxWidth: null },
  { id: 'tablet', name: 'Tablet', width: 768, maxWidth: 1023 },
  { id: 'mobile', name: 'Celular', width: 390, maxWidth: 767 },
]

export const baseBreakpoint = (doc: Doc) => doc.breakpoints[0].id

/** Breakpoints não-base que se aplicam em `bp`, na ordem da cascata. */
function cascade(doc: Pick<Doc, 'breakpoints'>, bp: string): string[] {
  const i = doc.breakpoints.findIndex((b) => b.id === bp)
  return i <= 0 ? [] : doc.breakpoints.slice(1, i + 1).map((b) => b.id)
}

function applyPartial<T extends object>(base: T, partial: object | undefined): T {
  if (!partial) return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) delete out[k]
    else out[k] = v
  }
  return out as T
}

/** O nó como ele aparece em `bp`: base + overrides da cascata. Sem overrides, devolve o mesmo objeto. */
export function resolveNode(doc: Pick<Doc, 'breakpoints'>, node: Node, bp: string): Node {
  if (!node.overrides) return node
  let { layout, style } = node
  for (const b of cascade(doc, bp)) {
    const o = node.overrides[b]
    if (!o) continue
    layout = applyPartial(layout, o.layout)
    style = applyPartial(style, o.style)
  }
  return layout === node.layout && style === node.style ? node : { ...node, layout, style }
}

const toOverride = (partial: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(partial).map(([k, v]) => [k, v === undefined ? null : v]))

/**
 * Aplica um patch no breakpoint `bp`. Na base altera o nó; nos outros grava override.
 * Nome e props (conteúdo) são sempre compartilhados entre breakpoints.
 */
export function updateNodeAt(doc: Doc, id: NodeId, patch: NodePatch, bp: string): Doc {
  const isBase = bp === baseBreakpoint(doc)
  return produce(doc, (d) => {
    const node = d.nodes[id]
    if (!node) return
    if (patch.name !== undefined) node.name = patch.name
    if (patch.props) Object.assign(node.props, patch.props)
    if (isBase) {
      if (patch.layout) Object.assign(node.layout, patch.layout)
      if (patch.style) Object.assign(node.style, patch.style)
      return
    }
    if (!patch.layout && !patch.style) return
    const o = ((node.overrides ??= {})[bp] ??= {})
    if (patch.layout) o.layout = { ...o.layout, ...toOverride(patch.layout) }
    if (patch.style) o.style = { ...o.style, ...toOverride(patch.style) }
  })
}

export interface OverrideKeys {
  layout?: (keyof Layout)[]
  style?: (keyof Style)[]
}

/** Remove overrides de `bp` (todos, ou só as chaves indicadas), voltando a herdar. */
export function clearOverrides(doc: Doc, id: NodeId, bp: string, keys?: OverrideKeys): Doc {
  if (!doc.nodes[id]?.overrides?.[bp]) return doc
  return produce(doc, (d) => {
    const all = d.nodes[id].overrides!
    if (!keys) {
      delete all[bp]
    } else {
      const o = all[bp]
      for (const k of keys.layout ?? []) delete o.layout?.[k]
      for (const k of keys.style ?? []) delete o.style?.[k]
      if (o.layout && !Object.keys(o.layout).length) delete o.layout
      if (o.style && !Object.keys(o.style).length) delete o.style
      if (!o.layout && !o.style) delete all[bp]
    }
    if (!Object.keys(all).length) delete d.nodes[id].overrides
  })
}

/** Chaves sobrescritas em `bp` (só nele, não na cascata). */
export function overriddenKeys(node: Node, bp: string): { layout: Set<string>; style: Set<string> } {
  const o: NodeOverride | undefined = node.overrides?.[bp]
  return { layout: new Set(Object.keys(o?.layout ?? {})), style: new Set(Object.keys(o?.style ?? {})) }
}

/** Documentos salvos antes dos breakpoints. */
export function migrateDoc(doc: Doc): Doc {
  return doc.breakpoints?.length ? doc : { ...doc, breakpoints: structuredClone(DEFAULT_BREAKPOINTS) }
}
