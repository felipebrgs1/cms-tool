import { useEffect, useRef, useState, type RefObject } from 'react'
import { createId } from '@cms/core'
import { editor, useEditor, type Camera } from '../store'
import { nodeElement } from './geometry'
import { worldRect } from './snap'

export const RULER_SIZE = 20
/** Intervalos possíveis entre marcações principais, em unidades do documento. */
const STEPS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

const COLORS = {
  bg: '#2c2c2c',
  border: '#3d3d3d',
  tick: '#5c5c5c',
  label: '#8f8f8f',
  band: 'rgba(13, 153, 255, 0.22)',
  accent: '#0d99ff',
}

export function Rulers({ viewportRef }: { viewportRef: RefObject<HTMLDivElement | null> }) {
  const show = useEditor((s) => s.showRulers)
  const camera = useEditor((s) => s.camera)
  const selection = useEditor((s) => s.selection)
  const doc = useEditor((s) => s.doc)
  const topRef = useRef<HTMLCanvasElement>(null)
  const leftRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const ro = new ResizeObserver(() => setSize({ w: vp.clientWidth, h: vp.clientHeight }))
    ro.observe(vp)
    return () => ro.disconnect()
  }, [viewportRef])

  useEffect(() => {
    const vp = viewportRef.current
    if (!show || !vp || !topRef.current || !leftRef.current) return
    const el = selection ? nodeElement(selection) : null
    const sel = el ? worldRect(el, vp, camera) : null
    drawRuler(topRef.current, 'x', size.w, camera, sel && [sel.x, sel.x + sel.w])
    drawRuler(leftRef.current, 'y', size.h, camera, sel && [sel.y, sel.y + sel.h])
  }, [show, camera, size, selection, doc, viewportRef])

  if (!show) return null
  return (
    <>
      <canvas
        ref={topRef}
        className="ruler ruler-top"
        title="Arraste para criar uma guia"
        onPointerDown={(e) => startGuideDrag(e, 'y', null, viewportRef.current!)}
      />
      <canvas
        ref={leftRef}
        className="ruler ruler-left"
        title="Arraste para criar uma guia"
        onPointerDown={(e) => startGuideDrag(e, 'x', null, viewportRef.current!)}
      />
      <div className="ruler-corner" />
    </>
  )
}

function drawRuler(
  canvas: HTMLCanvasElement,
  axis: 'x' | 'y',
  length: number,
  cam: Camera,
  selection: [number, number] | null,
) {
  const dpr = window.devicePixelRatio || 1
  const horizontal = axis === 'x'
  const [w, h] = horizontal ? [length, RULER_SIZE] : [RULER_SIZE, length]
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, w, h)

  const offset = horizontal ? cam.x : cam.y
  const toScreen = (v: number) => offset + v * cam.zoom

  if (selection) {
    const [s0, s1] = selection.map(toScreen)
    ctx.fillStyle = COLORS.band
    if (horizontal) ctx.fillRect(s0, 0, s1 - s0, h)
    else ctx.fillRect(0, s0, w, s1 - s0)
  }

  const step = STEPS.find((s) => s * cam.zoom >= 64) ?? STEPS[STEPS.length - 1]
  const subdivisions = step % 5 === 0 ? 5 : 2
  const minor = step / subdivisions
  const first = Math.floor(-offset / cam.zoom / minor)
  const last = Math.ceil((length - offset) / cam.zoom / minor)

  ctx.font = '10px Inter, system-ui, sans-serif'
  ctx.strokeStyle = COLORS.tick
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = first; i <= last; i++) {
    const p = Math.round(toScreen(i * minor)) + 0.5
    const major = i % subdivisions === 0
    const len = major ? 8 : 4
    if (horizontal) {
      ctx.moveTo(p, h - len)
      ctx.lineTo(p, h)
    } else {
      ctx.moveTo(w - len, p)
      ctx.lineTo(w, p)
    }
    if (major) label(ctx, String(Math.round(i * minor)), p, horizontal, COLORS.label)
  }
  ctx.stroke()

  // borda entre a régua e o canvas
  ctx.fillStyle = COLORS.border
  if (horizontal) ctx.fillRect(0, h - 1, w, 1)
  else ctx.fillRect(w - 1, 0, 1, h)

  if (selection) {
    for (const v of selection) {
      const p = toScreen(v)
      ctx.fillStyle = COLORS.bg
      if (horizontal) ctx.fillRect(p - 18, 0, 36, 12)
      else ctx.fillRect(0, p - 18, 12, 36)
      label(ctx, String(Math.round(v)), p, horizontal, COLORS.accent, true)
    }
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, p: number, horizontal: boolean, color: string, centered = false) {
  ctx.fillStyle = color
  ctx.textAlign = centered ? 'center' : 'left'
  ctx.textBaseline = 'top'
  if (horizontal) {
    ctx.fillText(text, centered ? p : p + 3, 2)
  } else {
    ctx.save()
    ctx.translate(2, centered ? p : p - 3)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
}

/**
 * Cria (id = null) ou move uma guia. Soltar a guia de volta sobre a régua a remove.
 * axis 'x' = guia vertical (vem da régua lateral), 'y' = horizontal (vem da régua de cima).
 */
export function startGuideDrag(e: React.PointerEvent, axis: 'x' | 'y', id: string | null, viewport: HTMLElement) {
  if (e.button !== 0) return
  e.preventDefault()
  e.stopPropagation()
  const guideId = id ?? createId()

  const posAt = (ev: PointerEvent) => {
    const v = viewport.getBoundingClientRect()
    const cam = editor.get().camera
    return Math.round(axis === 'x' ? (ev.clientX - v.left - cam.x) / cam.zoom : (ev.clientY - v.top - cam.y) / cam.zoom)
  }
  const overRuler = (ev: PointerEvent) => {
    const v = viewport.getBoundingClientRect()
    return (axis === 'x' ? ev.clientX - v.left : ev.clientY - v.top) < RULER_SIZE
  }
  const others = () => editor.get().guides.filter((g) => g.id !== guideId)

  const move = (ev: PointerEvent) => {
    editor.set({ guides: [...others(), { id: guideId, axis, pos: posAt(ev) }], draggingGuide: guideId })
  }
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    editor.set({ draggingGuide: null, ...(overRuler(ev) ? { guides: others() } : {}) })
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

export function GuideLayer({ viewportRef }: { viewportRef: RefObject<HTMLDivElement | null> }) {
  const guides = useEditor((s) => s.guides)
  const camera = useEditor((s) => s.camera)
  const dragging = useEditor((s) => s.draggingGuide)
  return (
    <>
      {guides.map((g) => {
        const p = (g.axis === 'x' ? camera.x : camera.y) + g.pos * camera.zoom
        return (
          <div
            key={g.id}
            className={`guide guide-${g.axis}${dragging === g.id ? ' dragging' : ''}`}
            style={g.axis === 'x' ? { left: p } : { top: p }}
            onPointerDown={(e) => startGuideDrag(e, g.axis, g.id, viewportRef.current!)}
          >
            <span className="guide-label">{g.pos}</span>
          </div>
        )
      })}
    </>
  )
}
