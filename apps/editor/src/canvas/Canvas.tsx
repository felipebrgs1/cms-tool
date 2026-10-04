import { useEffect, useRef } from 'react'
import { createNode, insertNodes, isWithin, moveNode, resolveClickTarget, resolveNode, updateNodeAt, type NodeId } from '@cms/core'
import { editor, useEditor, type Camera } from '../store'
import { fitToScreen, registerViewport, zoomAt } from '../camera'
import { NodeView } from './NodeView'
import { Overlay } from './Overlay'
import { findDropTarget, hitBreakpoint, hitNodeId, nodeElement, type DropTarget } from './geometry'
import { frameOffsets } from '../frames'
import { buildSnapContext, snapLines, snapOffset, SNAP_PX, worldRect, xLines, yLines, type SnapContext, type WRect } from './snap'
import { GuideLayer, Rulers } from './Rulers'

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | { kind: 'press'; id: NodeId; sx: number; sy: number; drillTo: NodeId | null }
  | {
      kind: 'move-abs'
      id: NodeId
      sx: number
      sy: number
      ox: number
      oy: number
      start: WRect
      snap: SnapContext
    }
  | { kind: 'move-flow'; id: NodeId; grabX: number; grabY: number; target: DropTarget | null }

const DRAG_THRESHOLD = 3

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable]')

export function Canvas() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const spaceDown = useRef(false)
  const camera = useEditor((s) => s.camera)
  const rootId = useEditor((s) => s.doc.rootId)
  const tool = useEditor((s) => s.tool)
  const breakpoints = useEditor((s) => s.doc.breakpoints)

  useEffect(() => {
    const vp = viewportRef.current!
    registerViewport(vp)
    requestAnimationFrame(fitToScreen)

    // wheel precisa ser não-passivo para impedir o zoom/scroll do navegador
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const cam = editor.get().camera
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect()
        const delta = Math.max(-60, Math.min(60, e.deltaY))
        zoomAt(cam.zoom * Math.exp(-delta * 0.01), e.clientX - r.left, e.clientY - r.top)
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
        editor.set({ camera: { ...cam, x: cam.x - dx, y: cam.y - dy } })
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return
      e.preventDefault()
      if (!spaceDown.current) {
        spaceDown.current = true
        vp.classList.add('space')
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceDown.current = false
      vp.classList.remove('space')
    }
    // Alt mostra as medidas; preventDefault evita o foco na barra de menu do navegador
    const onAlt = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return
      e.preventDefault()
      if (editor.get().measuring !== (e.type === 'keydown')) editor.set({ measuring: e.type === 'keydown' })
    }
    const onBlur = () => editor.set({ measuring: false })

    const onMove = (e: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      const s = editor.get()
      const zoom = s.camera.zoom

      if (g.kind === 'pan') {
        editor.set({ camera: { ...g.cam, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy } })
        return
      }

      if (g.kind === 'press') {
        if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < DRAG_THRESHOLD) return
        const raw = s.doc.nodes[g.id]
        if (!raw?.parentId) {
          gesture.current = null
          return
        }
        const node = resolveNode(s.doc, raw, s.breakpoint)
        const el = nodeElement(g.id)
        if (node.layout.position === 'absolute' && el) {
          gesture.current = {
            kind: 'move-abs',
            id: g.id,
            sx: g.sx,
            sy: g.sy,
            ox: node.layout.x,
            oy: node.layout.y,
            start: worldRect(el, vp, s.camera),
            snap: buildSnapContext(s.doc, g.id, vp),
          }
        } else {
          const r = nodeElement(g.id)?.getBoundingClientRect()
          gesture.current = {
            kind: 'move-flow',
            id: g.id,
            grabX: r ? (g.sx - r.left) / zoom : 0,
            grabY: r ? (g.sy - r.top) / zoom : 0,
            target: null,
          }
          editor.set({ draggingId: g.id, hover: null })
        }
        onMove(e)
        return
      }

      if (g.kind === 'move-abs') {
        const snap = !(e.ctrlKey || e.metaKey)
        const threshold = SNAP_PX / zoom
        const dx = (e.clientX - g.sx) / zoom
        const dy = (e.clientY - g.sy) / zoom
        const moved = { ...g.start, x: g.start.x + dx, y: g.start.y + dy }
        const x = Math.round(g.ox + dx + (snap ? snapOffset(xLines(moved), g.snap.x, threshold) : 0))
        const y = Math.round(g.oy + dy + (snap ? snapOffset(yLines(moved), g.snap.y, threshold) : 0))
        const final = { ...g.start, x: g.start.x + x - g.ox, y: g.start.y + y - g.oy }
        editor.patch(g.id, { layout: { x, y } }, true)
        editor.set({
          snapLines: snap
            ? [...snapLines('x', final, xLines(final), g.snap.x), ...snapLines('y', final, yLines(final), g.snap.y)]
            : [],
        })
        return
      }

      g.target = findDropTarget(s.doc, e.clientX, e.clientY, g.id, vp, zoom)
      editor.set({ drop: g.target ? { parent: g.target.parentRect, indicator: g.target.indicator } : null })
    }

    const onUp = () => {
      const g = gesture.current
      gesture.current = null
      vp.classList.remove('panning')
      if (g?.kind === 'press' && g.drillTo) editor.set({ selection: g.drillTo })
      if (g?.kind === 'move-abs') {
        editor.endPreview()
        editor.set({ snapLines: [] })
      }
      if (g?.kind === 'move-flow') {
        editor.set({ draggingId: null, drop: null })
        const t = g.target
        if (!t) return
        editor.commit((doc) => {
          const next = moveNode(doc, g.id, t.parentId, t.index)
          if (!t.absolute) return next
          const layout = { position: 'absolute' as const, x: Math.round(t.absolute.x - g.grabX), y: Math.round(t.absolute.y - g.grabY) }
          return updateNodeAt(next, g.id, { layout }, t.bp)
        })
      }
    }

    vp.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onAlt)
    window.addEventListener('keyup', onAlt)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      registerViewport(null)
      vp.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('keydown', onAlt)
      window.removeEventListener('keyup', onAlt)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    const vp = viewportRef.current!
    if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
      e.preventDefault()
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam: editor.get().camera }
      vp.classList.add('panning')
      return
    }
    if (e.button !== 0) return

    const target = e.target as Element
    const editingId = editor.get().editingId
    if (editingId) {
      if (target.closest(`[data-node-id="${CSS.escape(editingId)}"]`)) return
      ;(document.activeElement as HTMLElement | null)?.blur()
    }

    // clicar dentro de um frame ativa o breakpoint dele
    const bp = hitBreakpoint(target)
    if (bp && bp !== editor.get().breakpoint) editor.set({ breakpoint: bp })

    const s = editor.get()
    const hitId = hitNodeId(target)

    if (s.tool !== 'move') {
      const t = findDropTarget(s.doc, e.clientX, e.clientY, null, vp, s.camera.zoom)
      if (!t) return
      // sem isso o mousedown padrão tira o foco do texto recém-criado
      e.preventDefault()
      const node = createNode(s.tool)
      if (t.absolute) node.layout = { ...node.layout, position: 'absolute', ...t.absolute }
      editor.commit((doc) => insertNodes(doc, [node], t.parentId, t.index))
      editor.set({ selection: node.id, tool: 'move', drop: null, editingId: s.tool === 'text' ? node.id : null })
      return
    }

    if (!hitId) {
      editor.set({ selection: null })
      return
    }
    if (e.metaKey || e.ctrlKey) {
      editor.set({ selection: hitId })
      gesture.current = { kind: 'press', id: hitId, sx: e.clientX, sy: e.clientY, drillTo: null }
      return
    }
    // Pressionar dentro da seleção atual mantém a seleção (para arrastá-la);
    // só desce para o filho se o clique terminar sem arrasto.
    const clicked = resolveClickTarget(s.doc, hitId, s.selection)
    if (s.selection && clicked !== s.selection && isWithin(s.doc, hitId, s.selection)) {
      gesture.current = { kind: 'press', id: s.selection, sx: e.clientX, sy: e.clientY, drillTo: clicked }
      return
    }
    editor.set({ selection: clicked })
    gesture.current = { kind: 'press', id: clicked, sx: e.clientX, sy: e.clientY, drillTo: null }
  }

  const onHover = (e: React.PointerEvent) => {
    if (gesture.current) return
    const s = editor.get()
    if (s.tool !== 'move') {
      const t = findDropTarget(s.doc, e.clientX, e.clientY, null, viewportRef.current!, s.camera.zoom)
      editor.set({ drop: t ? { parent: t.parentRect, indicator: t.indicator } : null, hover: null })
      return
    }
    const hitId = hitNodeId(e.target as Element)
    const hoverBp = hitBreakpoint(e.target as Element)
    const deep = e.metaKey || e.ctrlKey || e.altKey
    const hover = hitId ? (deep ? hitId : resolveClickTarget(s.doc, hitId, s.selection)) : null
    if (hover !== s.hover || hoverBp !== s.hoverBp) editor.set({ hover, hoverBp })
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const hitId = hitNodeId(e.target as Element)
    if (!hitId || editor.get().tool !== 'move') return
    const node = editor.get().doc.nodes[hitId]
    const bp = hitBreakpoint(e.target as Element) ?? editor.get().breakpoint
    editor.set({ selection: hitId, breakpoint: bp, editingId: node.type === 'text' ? hitId : null })
  }

  return (
    <div
      ref={viewportRef}
      className={`viewport${tool !== 'move' ? ' inserting' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onHover}
      onPointerLeave={() => !gesture.current && editor.set({ hover: null, drop: null })}
      onDoubleClick={onDoubleClick}
    >
      <div
        className="world"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        {frameOffsets(breakpoints).map(({ bp, x }) => (
          <div key={bp.id} className="bp-frame" data-bp={bp.id} style={{ left: x }}>
            <NodeView id={rootId} bp={bp.id} />
          </div>
        ))}
      </div>
      <GuideLayer viewportRef={viewportRef} />
      <Overlay viewportRef={viewportRef} />
      <Rulers viewportRef={viewportRef} />
    </div>
  )
}
