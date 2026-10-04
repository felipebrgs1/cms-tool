import { isWithin, resolveNode, type Doc, type NodeId } from '@cms/core'
import { editor, type Rect } from '../store'

export function hitNodeId(el: Element | null): NodeId | null {
  return el?.closest('[data-node-id]')?.getAttribute('data-node-id') ?? null
}

/** Breakpoint do frame que contém o elemento. */
export function hitBreakpoint(el: Element | null): string | null {
  return el?.closest('[data-bp]')?.getAttribute('data-bp') ?? null
}

/** Elemento do nó dentro do frame de um breakpoint (padrão: o ativo). */
export function nodeElement(id: NodeId, bp: string = editor.get().breakpoint): HTMLElement | null {
  return document.querySelector(`[data-bp="${CSS.escape(bp)}"] [data-node-id="${CSS.escape(id)}"]`)
}

export function relRect(r: DOMRect, viewport: Element): Rect {
  const v = viewport.getBoundingClientRect()
  return { x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height }
}

const EDGE_ZONE = 0.25

export interface DropTarget {
  parentId: NodeId
  /** Breakpoint do frame onde o drop acontece. */
  bp: string
  /** Índice entre os filhos do pai, desconsiderando o nó arrastado. */
  index: number
  /** Preenchido quando o pai não tem auto layout: posição local em unidades do documento. */
  absolute: { x: number; y: number } | null
  parentRect: Rect
  indicator: Rect | null
}

/**
 * Encontra o frame sob o ponteiro e onde um filho entraria nele.
 * Em frames com auto layout, o índice vem da comparação com o meio de cada irmão no eixo principal.
 */
export function findDropTarget(
  doc: Doc,
  clientX: number,
  clientY: number,
  draggedId: NodeId | null,
  viewport: Element,
  zoom: number,
): DropTarget | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (!viewport.contains(el)) continue
    const id = el.getAttribute('data-node-id')
    const bp = hitBreakpoint(el)
    const raw = id ? doc.nodes[id] : undefined
    if (!id || !raw || !bp || raw.type !== 'frame') continue
    if (draggedId && isWithin(doc, id, draggedId)) continue
    // layouts resolvidos no breakpoint do frame (no celular um frame horizontal pode ser vertical)
    const node = resolveNode(doc, raw, bp)
    const at = (nid: NodeId) => resolveNode(doc, doc.nodes[nid], bp)

    const pr = el.getBoundingClientRect()
    // Nas bordas (25%) de um frame em auto layout, o drop vai para o pai: reordenar em vez de aninhar.
    const outer = node.parentId ? at(node.parentId) : null
    if (outer && outer.layout.mode !== 'none' && node.layout.position === 'auto') {
      const horizontal = outer.layout.mode === 'horizontal'
      const t = horizontal ? (clientX - pr.left) / pr.width : (clientY - pr.top) / pr.height
      if (t < EDGE_ZONE || t > 1 - EDGE_ZONE) continue
    }
    const parentRect = relRect(pr, viewport)
    const siblings = node.children.filter((c) => c !== draggedId)

    if (node.layout.mode === 'none') {
      return {
        parentId: id,
        bp,
        index: siblings.length,
        absolute: { x: Math.round((clientX - pr.left) / zoom), y: Math.round((clientY - pr.top) / zoom) },
        parentRect,
        indicator: null,
      }
    }

    const horizontal = node.layout.mode === 'horizontal'
    const half = (node.layout.gap * zoom) / 2
    const v = viewport.getBoundingClientRect()
    let index = siblings.length
    let indicator: Rect | null = null
    let last: DOMRect | null = null

    for (let i = 0; i < siblings.length; i++) {
      const sibling = at(siblings[i])
      if (sibling.layout.position === 'absolute' || sibling.layout.hidden) continue
      const sib = nodeElement(siblings[i], bp)
      if (!sib) continue
      const r = sib.getBoundingClientRect()
      const mid = horizontal ? r.left + r.width / 2 : r.top + r.height / 2
      if ((horizontal ? clientX : clientY) < mid) {
        index = i
        indicator = horizontal
          ? { x: r.left - v.left - half - 1, y: r.top - v.top, w: 2, h: r.height }
          : { x: r.left - v.left, y: r.top - v.top - half - 1, w: r.width, h: 2 }
        break
      }
      last = r
    }
    if (!indicator && last) {
      indicator = horizontal
        ? { x: last.right - v.left + half - 1, y: last.top - v.top, w: 2, h: last.height }
        : { x: last.left - v.left, y: last.bottom - v.top + half - 1, w: last.width, h: 2 }
    }
    return { parentId: id, bp, index, absolute: null, parentRect, indicator }
  }
  return null
}
