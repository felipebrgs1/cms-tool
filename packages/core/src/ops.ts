import { produce } from 'immer'
import { DEFAULT_BREAKPOINTS } from './breakpoints'
import type { Doc, Layout, Node, NodeId, NodeOverride, NodePatch, NodeProps, NodeType, Style } from './types'

export const createId = () => crypto.randomUUID().slice(0, 8)

export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#f9a8d4"/>' +
      '</linearGradient></defs><rect width="800" height="500" fill="url(#g)"/>' +
      '<circle cx="400" cy="250" r="56" fill="#fff" fill-opacity=".35"/></svg>',
  )

const BASE_LAYOUT: Layout = {
  mode: 'none',
  gap: 0,
  padding: [0, 0, 0, 0],
  mainAlign: 'start',
  crossAlign: 'start',
  wrap: false,
  width: { type: 'hug' },
  height: { type: 'hug' },
  position: 'auto',
  x: 0,
  y: 0,
}

const DEFAULTS: Record<NodeType, { name: string; layout: Partial<Layout>; style: Style; props: NodeProps }> = {
  frame: {
    name: 'Frame',
    layout: {
      mode: 'vertical',
      gap: 12,
      padding: [16, 16, 16, 16],
      width: { type: 'fixed', value: 240 },
      height: { type: 'fixed', value: 160 },
    },
    style: { fill: '#e9e9ef', radius: 8 },
    props: {},
  },
  text: {
    name: 'Texto',
    layout: {},
    style: { fontSize: 16, color: '#111827', lineHeight: 1.4 },
    props: { text: 'Texto', tag: 'p' },
  },
  image: {
    name: 'Imagem',
    layout: { width: { type: 'fixed', value: 320 }, height: { type: 'fixed', value: 200 } },
    style: { radius: 8 },
    props: { src: PLACEHOLDER_IMAGE, alt: '', fit: 'cover' },
  },
}

export interface NodeInit {
  name?: string
  props?: Partial<NodeProps>
  layout?: Partial<Layout>
  style?: Partial<Style>
  overrides?: Record<string, NodeOverride>
}

export interface NodeSpec extends NodeInit {
  type: NodeType
  children?: NodeSpec[]
}

export function createNode(type: NodeType, init: NodeInit = {}): Node {
  const d = DEFAULTS[type]
  return {
    id: createId(),
    type,
    name: init.name ?? d.name,
    parentId: null,
    children: [],
    props: { ...d.props, ...init.props },
    layout: { ...BASE_LAYOUT, ...d.layout, ...init.layout },
    style: { ...d.style, ...init.style },
    ...(init.overrides ? { overrides: structuredClone(init.overrides) } : {}),
  }
}

/** Constrói uma subárvore a partir de uma spec aninhada. O primeiro item é a raiz. */
export function buildTree(spec: NodeSpec): Node[] {
  const out: Node[] = []
  const walk = (s: NodeSpec, parentId: NodeId | null): Node => {
    const node = createNode(s.type, s)
    node.parentId = parentId
    out.push(node)
    for (const child of s.children ?? []) node.children.push(walk(child, node.id).id)
    return node
  }
  walk(spec, null)
  return out
}

export function createDoc(spec: NodeSpec): Doc {
  const nodes = buildTree(spec)
  return {
    version: 1,
    rootId: nodes[0].id,
    breakpoints: structuredClone(DEFAULT_BREAKPOINTS),
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
  }
}

// ---------- consultas ----------

/** Ancestrais do nó, do pai até a raiz. */
export function getAncestors(doc: Doc, id: NodeId): NodeId[] {
  const out: NodeId[] = []
  let cur = doc.nodes[id]?.parentId ?? null
  while (cur) {
    out.push(cur)
    cur = doc.nodes[cur]?.parentId ?? null
  }
  return out
}

/** true se `id` é `ancestorId` ou está dentro dele. */
export function isWithin(doc: Doc, id: NodeId, ancestorId: NodeId): boolean {
  return id === ancestorId || getAncestors(doc, id).includes(ancestorId)
}

export function collectSubtree(doc: Doc, id: NodeId): NodeId[] {
  const node = doc.nodes[id]
  if (!node) return []
  return [id, ...node.children.flatMap((c) => collectSubtree(doc, c))]
}

/**
 * Regra de clique do Figma: seleciona o nó mais profundo cujo pai já está "aberto"
 * (a raiz, o nó selecionado ou algum ancestral dele). Cliques repetidos descem um nível por vez.
 */
export function resolveClickTarget(doc: Doc, hitId: NodeId, selectedId: NodeId | null): NodeId {
  const scope = new Set<NodeId>([doc.rootId])
  if (selectedId && doc.nodes[selectedId]) {
    scope.add(selectedId)
    for (const a of getAncestors(doc, selectedId)) scope.add(a)
  }
  let cur: NodeId | null = hitId
  while (cur) {
    const node: Node = doc.nodes[cur]
    if (node.parentId === null || scope.has(node.parentId)) return cur
    cur = node.parentId
  }
  return hitId
}

// ---------- operações (puras: Doc -> Doc) ----------

export function insertNodes(doc: Doc, nodes: Node[], parentId: NodeId, index?: number): Doc {
  const [root] = nodes
  return produce(doc, (d) => {
    for (const n of nodes) d.nodes[n.id] = n
    d.nodes[root.id].parentId = parentId
    const siblings = d.nodes[parentId].children
    siblings.splice(index ?? siblings.length, 0, root.id)
  })
}

/** `index` é a posição na lista de filhos do novo pai *sem* o nó movido. */
export function moveNode(doc: Doc, id: NodeId, parentId: NodeId, index: number): Doc {
  return produce(doc, (d) => {
    const node = d.nodes[id]
    if (!node.parentId) return
    const from = d.nodes[node.parentId].children
    from.splice(from.indexOf(id), 1)
    const to = d.nodes[parentId].children
    to.splice(Math.max(0, Math.min(index, to.length)), 0, id)
    node.parentId = parentId
  })
}

export function updateNode(doc: Doc, id: NodeId, patch: NodePatch): Doc {
  return produce(doc, (d) => {
    const node = d.nodes[id]
    if (!node) return
    if (patch.name !== undefined) node.name = patch.name
    if (patch.props) Object.assign(node.props, patch.props)
    if (patch.layout) Object.assign(node.layout, patch.layout)
    if (patch.style) Object.assign(node.style, patch.style)
  })
}

export function removeNode(doc: Doc, id: NodeId): Doc {
  const node = doc.nodes[id]
  if (!node?.parentId) return doc
  const ids = collectSubtree(doc, id)
  return produce(doc, (d) => {
    const siblings = d.nodes[node.parentId!].children
    siblings.splice(siblings.indexOf(id), 1)
    for (const i of ids) delete d.nodes[i]
  })
}

export function duplicateNode(doc: Doc, id: NodeId): { doc: Doc; id: NodeId } {
  const node = doc.nodes[id]
  if (!node?.parentId) return { doc, id }
  const idMap = new Map(collectSubtree(doc, id).map((old) => [old, createId()]))
  const clones = [...idMap].map(([oldId, newId]): Node => {
    const src = doc.nodes[oldId]
    return {
      ...structuredClone(src),
      id: newId,
      parentId: src.parentId ? (idMap.get(src.parentId) ?? src.parentId) : null,
      children: src.children.map((c) => idMap.get(c)!),
    }
  })
  const root = clones[0]
  if (root.layout.position === 'absolute') root.layout = { ...root.layout, x: root.layout.x + 16, y: root.layout.y + 16 }
  const index = doc.nodes[node.parentId].children.indexOf(id) + 1
  return { doc: insertNodes(doc, clones, node.parentId, index), id: root.id }
}
