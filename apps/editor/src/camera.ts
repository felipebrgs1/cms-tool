import { editor } from './store'
import { frameOffsets } from './frames'

let viewport: HTMLElement | null = null

export function registerViewport(el: HTMLElement | null) {
  viewport = el
}

const clampZoom = (z: number) => Math.min(8, Math.max(0.05, z))

/** Zoom mantendo fixo o ponto (px, py) do viewport. */
export function zoomAt(zoom: number, px: number, py: number) {
  const cam = editor.get().camera
  const next = clampZoom(zoom)
  const k = next / cam.zoom
  editor.set({ camera: { zoom: next, x: px - (px - cam.x) * k, y: py - (py - cam.y) * k } })
}

export function zoomBy(factor: number) {
  if (!viewport) return
  const cam = editor.get().camera
  zoomAt(cam.zoom * factor, viewport.clientWidth / 2, viewport.clientHeight / 2)
}

/** Enquadra horizontalmente o trecho [x, x + width] do mundo (sem passar de 100%). */
function fitRange(x: number, width: number) {
  if (!viewport) return
  const zoom = clampZoom(Math.min(1, (viewport.clientWidth - 96) / width))
  editor.set({ camera: { zoom, x: (viewport.clientWidth - width * zoom) / 2 - x * zoom, y: 56 } })
}

/** Enquadra todos os breakpoints lado a lado. */
export function fitToScreen() {
  const frames = frameOffsets(editor.get().doc.breakpoints)
  const last = frames[frames.length - 1]
  fitRange(0, last.x + last.bp.width)
}

/** Enquadra o frame de um breakpoint (padrão: o ativo). */
export function fitFrame(bp: string = editor.get().breakpoint) {
  const frame = frameOffsets(editor.get().doc.breakpoints).find((f) => f.bp.id === bp)
  if (frame) fitRange(frame.x, frame.bp.width)
}
