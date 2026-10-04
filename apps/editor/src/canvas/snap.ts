import type { Doc, NodeId } from '@cms/core'
import { editor, type Camera, type SnapLine } from '../store'
import { nodeElement } from './geometry'

/** Distância em px de tela a partir da qual o snap "puxa". */
export const SNAP_PX = 6

/** Retângulo em coordenadas do mundo (unidades do documento; a página começa em 0,0). */
export interface WRect {
  x: number
  y: number
  w: number
  h: number
}

interface Target {
  pos: number
  /** Elemento dono da linha; null para guias da régua (que já são visíveis). */
  rect: WRect | null
}

export interface SnapContext {
  x: Target[]
  y: Target[]
}

export function worldRect(el: Element, viewport: Element, cam: Camera): WRect {
  const r = el.getBoundingClientRect()
  const v = viewport.getBoundingClientRect()
  return {
    x: (r.left - v.left - cam.x) / cam.zoom,
    y: (r.top - v.top - cam.y) / cam.zoom,
    w: r.width / cam.zoom,
    h: r.height / cam.zoom,
  }
}

/** Bordas e centro em cada eixo. */
export const xLines = (r: WRect) => [r.x, r.x + r.w / 2, r.x + r.w]
export const yLines = (r: WRect) => [r.y, r.y + r.h / 2, r.y + r.h]

/**
 * Alvos de snap de um nó: o pai, os irmãos e as guias da régua.
 * Medido uma vez no início do gesto; durante o arrasto só o nó arrastado muda.
 */
export function buildSnapContext(doc: Doc, id: NodeId, viewport: Element): SnapContext {
  const { camera, guides } = editor.get()
  const node = doc.nodes[id]
  const ctx: SnapContext = { x: [], y: [] }
  const ids = node?.parentId ? [node.parentId, ...doc.nodes[node.parentId].children.filter((c) => c !== id)] : []
  for (const cid of ids) {
    const el = nodeElement(cid)
    if (!el) continue
    const rect = worldRect(el, viewport, camera)
    for (const pos of xLines(rect)) ctx.x.push({ pos, rect })
    for (const pos of yLines(rect)) ctx.y.push({ pos, rect })
  }
  for (const g of guides) ctx[g.axis].push({ pos: g.pos, rect: null })
  return ctx
}

/** Menor deslocamento que alinha algum dos `values` a um alvo dentro do limiar (0 se nenhum). */
export function snapOffset(values: number[], targets: Target[], threshold: number): number {
  let best = 0
  let bestAbs = threshold
  for (const t of targets) {
    for (const v of values) {
      const d = t.pos - v
      if (Math.abs(d) < bestAbs) {
        best = d
        bestAbs = Math.abs(d)
      }
    }
  }
  return best
}

/** Linhas a desenhar: alvos que coincidem com algum valor, esticadas para cobrir os dois elementos. */
export function snapLines(axis: 'x' | 'y', rect: WRect, values: number[], targets: Target[]): SnapLine[] {
  const lines = new Map<number, SnapLine>()
  const span = (r: WRect): [number, number] => (axis === 'x' ? [r.y, r.y + r.h] : [r.x, r.x + r.w])
  for (const t of targets) {
    if (!t.rect || !values.some((v) => Math.abs(v - t.pos) < 1)) continue
    const [a0, a1] = span(rect)
    const [b0, b1] = span(t.rect)
    const key = Math.round(t.pos)
    const cur = lines.get(key)
    lines.set(key, {
      axis,
      pos: t.pos,
      from: Math.min(a0, b0, cur?.from ?? Infinity),
      to: Math.max(a1, b1, cur?.to ?? -Infinity),
    })
  }
  return [...lines.values()]
}
