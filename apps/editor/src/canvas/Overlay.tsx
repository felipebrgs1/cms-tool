import { useEffect, useState, type RefObject } from 'react'
import { resolveNode, type Layout, type NodeId } from '@cms/core'
import { editor, useEditor, type Camera, type Rect, type SnapLine } from '../store'
import { nodeElement, relRect } from './geometry'
import { buildSnapContext, snapLines, snapOffset, SNAP_PX, worldRect, type WRect } from './snap'

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Linha de medida em coordenadas de tela, com o valor já em unidades do documento. */
interface Measure {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
}

interface FrameTitle {
  bp: string
  label: string
  rect: Rect
}

interface Frame {
  sel: Rect | null
  /** A mesma seleção nos outros breakpoints. */
  ghosts: Rect[]
  hover: Rect | null
  titles: FrameTitle[]
  measureTarget: Rect | null
  measures: Measure[]
}

const EMPTY: Frame = { sel: null, ghosts: [], hover: null, titles: [], measureTarget: null, measures: [] }

/** Em elementos pequenos na tela, as alças do meio cobririam o próprio elemento e impediriam de arrastá-lo. */
const MIN_FOR_SIDE_HANDLES = 32
const visibleHandles = (r: Rect) =>
  HANDLES.filter((h) => {
    if (h === 'n' || h === 's') return r.h >= MIN_FOR_SIDE_HANDLES
    if (h === 'e' || h === 'w') return r.w >= MIN_FOR_SIDE_HANDLES
    return true
  })

const box = (r: Rect) => ({ left: r.x, top: r.y, width: r.w, height: r.h })

/**
 * Camada de UI desenhada por cima do canvas, em coordenadas de tela (não escala com o zoom).
 * Mede o DOM real a cada frame: o layout é do navegador, nós só desenhamos em cima.
 */
export function Overlay({ viewportRef }: { viewportRef: RefObject<HTMLDivElement | null> }) {
  const [frame, setFrame] = useState<Frame>(EMPTY)
  const node = useEditor((s) => (s.selection ? s.doc.nodes[s.selection] : null))
  const drop = useEditor((s) => s.drop)
  const camera = useEditor((s) => s.camera)
  const lines = useEditor((s) => s.snapLines)
  const measuring = useEditor((s) => s.measuring)
  const activeBp = useEditor((s) => s.breakpoint)
  const busy = useEditor((s) => s.editingId !== null || s.draggingId !== null)

  useEffect(() => {
    let raf = 0
    let last = ''
    const tick = () => {
      const vp = viewportRef.current
      if (vp) {
        const next = measureFrame(vp)
        const key = JSON.stringify(next)
        if (key !== last) {
          last = key
          setFrame(next)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [viewportRef])

  return (
    <div className="overlay">
      {frame.titles.map((t) => (
        <button
          key={t.bp}
          className={`frame-title${t.bp === activeBp ? ' active' : ''}`}
          style={{ left: t.rect.x, top: t.rect.y - 24, maxWidth: t.rect.w }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => editor.set({ breakpoint: t.bp, selection: editor.get().doc.rootId })}
        >
          {t.label}
        </button>
      ))}
      {frame.ghosts.map((g, i) => (
        <div key={i} className="ghost-box" style={box(g)} />
      ))}
      {frame.hover && !measuring && <div className="hover-box" style={box(frame.hover)} />}
      {drop && <div className="drop-parent" style={box(drop.parent)} />}
      {drop?.indicator && <div className="drop-line" style={box(drop.indicator)} />}

      {frame.sel && node && (
        <div className="sel-box" style={box(frame.sel)}>
          {!measuring && (
            <div className="size-badge">
              {Math.round(frame.sel.w / camera.zoom)} × {Math.round(frame.sel.h / camera.zoom)}
            </div>
          )}
          {!busy &&
            !measuring &&
            node.parentId &&
            visibleHandles(frame.sel).map((h) => (
              <div key={h} className={`handle handle-${h}`} onPointerDown={(e) => startResize(e, h, node.id, viewportRef)} />
            ))}
        </div>
      )}

      {lines.map((l, i) => (
        <SnapLineView key={i} line={l} camera={camera} />
      ))}

      {frame.measureTarget && <div className="measure-target" style={box(frame.measureTarget)} />}
      {frame.measures.map((m, i) => (
        <MeasureView key={i} m={m} />
      ))}
    </div>
  )
}

function SnapLineView({ line, camera }: { line: SnapLine; camera: Camera }) {
  const pos = (line.axis === 'x' ? camera.x : camera.y) + line.pos * camera.zoom
  const from = (line.axis === 'x' ? camera.y : camera.x) + line.from * camera.zoom
  const len = (line.to - line.from) * camera.zoom
  const style =
    line.axis === 'x' ? { left: pos, top: from, width: 1, height: len } : { left: from, top: pos, width: len, height: 1 }
  return <div className="snap-line" style={style} />
}

function MeasureView({ m }: { m: Measure }) {
  const horizontal = m.y1 === m.y2
  const style = horizontal
    ? { left: Math.min(m.x1, m.x2), top: m.y1, width: Math.abs(m.x2 - m.x1), height: 1 }
    : { left: m.x1, top: Math.min(m.y1, m.y2), width: 1, height: Math.abs(m.y2 - m.y1) }
  return (
    <>
      <div className="measure-line" style={style} />
      <div className="measure-label" style={{ left: (m.x1 + m.x2) / 2, top: (m.y1 + m.y2) / 2 }}>
        {m.label}
      </div>
    </>
  )
}

function measureFrame(vp: HTMLElement): Frame {
  const s = editor.get()
  const rect = (id: NodeId | null, bp?: string) => {
    const el = id ? nodeElement(id, bp) : null
    if (!el) return null
    const r = relRect(el.getBoundingClientRect(), vp)
    return r.w || r.h ? r : null // oculto (display: none) neste breakpoint
  }
  const sel = rect(s.selection)
  const others = s.doc.breakpoints.filter((b) => b.id !== s.breakpoint)
  const hoverBp = s.hoverBp ?? s.breakpoint
  const frame: Frame = {
    ...EMPTY,
    sel,
    ghosts: others.map((b) => rect(s.selection, b.id)).filter((r): r is Rect => r !== null),
    hover: s.hover !== s.selection || hoverBp !== s.breakpoint ? rect(s.hover, hoverBp) : null,
    titles: s.doc.breakpoints.flatMap((b) => {
      const r = rect(s.doc.rootId, b.id)
      return r ? [{ bp: b.id, label: `${b.name} · ${b.width}`, rect: r }] : []
    }),
  }
  if (s.measuring && sel && s.selection) {
    // Alt: mede até o elemento sob o cursor; sem hover, até o pai
    const targetId = s.hover && s.hover !== s.selection ? s.hover : s.doc.nodes[s.selection]?.parentId
    const target = rect(targetId ?? null)
    if (target) {
      frame.measureTarget = target
      frame.measures = measureBetween(sel, target, s.camera.zoom)
    }
  }
  return frame
}

const overlapMid = (a0: number, a1: number, b0: number, b1: number) => {
  const lo = Math.max(a0, b0)
  const hi = Math.min(a1, b1)
  return hi > lo ? (lo + hi) / 2 : null
}

/**
 * Distâncias à la Figma entre dois retângulos de tela:
 * separados num eixo → o vão entre eles; um dentro do outro → as quatro margens internas.
 */
function measureBetween(a: Rect, b: Rect, zoom: number): Measure[] {
  const out: Measure[] = []
  const push = (x1: number, y1: number, x2: number, y2: number) => {
    const d = Math.abs(x2 - x1) + Math.abs(y2 - y1)
    if (d >= 0.5) out.push({ x1, y1, x2, y2, label: String(Math.round(d / zoom)) })
  }
  const aR = a.x + a.w
  const aB = a.y + a.h
  const bR = b.x + b.w
  const bB = b.y + b.h
  const midY = overlapMid(a.y, aB, b.y, bB) ?? a.y + a.h / 2
  const midX = overlapMid(a.x, aR, b.x, bR) ?? a.x + a.w / 2

  if (aR <= b.x) push(aR, midY, b.x, midY)
  else if (bR <= a.x) push(bR, midY, a.x, midY)
  else {
    const [inner, outer] = a.x >= b.x && aR <= bR ? [a, b] : b.x >= a.x && bR <= aR ? [b, a] : [null, null]
    if (inner && outer) {
      push(outer.x, midY, inner.x, midY)
      push(inner.x + inner.w, midY, outer.x + outer.w, midY)
    }
  }

  if (aB <= b.y) push(midX, aB, midX, b.y)
  else if (bB <= a.y) push(midX, bB, midX, a.y)
  else {
    const [inner, outer] = a.y >= b.y && aB <= bB ? [a, b] : b.y >= a.y && bB <= aB ? [b, a] : [null, null]
    if (inner && outer) {
      push(midX, outer.y, midX, inner.y)
      push(midX, inner.y + inner.h, midX, outer.y + outer.h)
    }
  }
  return out
}

function startResize(e: React.PointerEvent, handle: Handle, id: NodeId, viewportRef: RefObject<HTMLDivElement | null>) {
  e.stopPropagation()
  e.preventDefault()
  const vp = viewportRef.current
  const s = editor.get()
  const raw = s.doc.nodes[id]
  const el = nodeElement(id)
  if (!raw || !el || !vp) return
  const node = resolveNode(s.doc, raw, s.breakpoint)

  const zoom = s.camera.zoom
  const start: WRect = worldRect(el, vp, s.camera)
  const startLayout = { x: node.layout.x, y: node.layout.y }
  const absolute = node.layout.position === 'absolute' && node.parentId !== null
  const ctx = buildSnapContext(s.doc, id, vp)
  const threshold = SNAP_PX / zoom
  const sx = e.clientX
  const sy = e.clientY

  /** Redimensiona um eixo, encaixando a borda que se move nos alvos de snap. */
  const resizeAxis = (axis: 'x' | 'y', delta: number, fromStart: boolean, snap: boolean) => {
    const origin = axis === 'x' ? start.x : start.y
    const size = axis === 'x' ? start.w : start.h
    const edge = fromStart ? origin + delta : origin + size + delta
    const snapped = edge + (snap ? snapOffset([edge], ctx[axis], threshold) : 0)
    const next = Math.max(1, Math.round(fromStart ? origin + size - snapped : snapped - origin))
    const movedEdge = fromStart ? origin + size - next : origin + next
    return { size: next, movedEdge }
  }

  const move = (ev: PointerEvent) => {
    const snap = !(ev.ctrlKey || ev.metaKey)
    const layout: Partial<Layout> = {}
    const final = { ...start }
    const lines: SnapLine[] = []
    const edges: { axis: 'x' | 'y'; pos: number }[] = []

    if (handle.includes('e') || handle.includes('w')) {
      const west = handle.includes('w')
      const r = resizeAxis('x', (ev.clientX - sx) / zoom, west, snap)
      layout.width = { type: 'fixed', value: r.size }
      if (absolute && west) layout.x = Math.round(startLayout.x + start.w - r.size)
      final.w = r.size
      if (west) final.x = start.x + start.w - r.size
      edges.push({ axis: 'x', pos: r.movedEdge })
    }
    if (handle.includes('n') || handle.includes('s')) {
      const north = handle.includes('n')
      const r = resizeAxis('y', (ev.clientY - sy) / zoom, north, snap)
      layout.height = { type: 'fixed', value: r.size }
      if (absolute && north) layout.y = Math.round(startLayout.y + start.h - r.size)
      final.h = r.size
      if (north) final.y = start.y + start.h - r.size
      edges.push({ axis: 'y', pos: r.movedEdge })
    }
    if (snap) for (const edge of edges) lines.push(...snapLines(edge.axis, final, [edge.pos], ctx[edge.axis]))

    editor.patch(id, { layout }, true)
    editor.set({ snapLines: lines })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    editor.endPreview()
    editor.set({ snapLines: [] })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
