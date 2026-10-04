import { useEffect } from 'react'
import {
  createNode,
  duplicateNode,
  insertNodes,
  moveNode,
  removeNode,
  resolveNode,
  updateNode,
  type Doc,
  type NodeId,
} from '@cms/core'
import { editor } from './store'
import { fitFrame, fitToScreen, zoomBy } from './camera'
import { Toolbar } from './Toolbar'
import { Canvas } from './canvas/Canvas'
import { LayersPanel } from './panels/Layers'
import { PropertiesPanel } from './panels/Properties'

const TOOL_KEYS = { v: 'move', f: 'frame', t: 'text', i: 'image' } as const

/** Envolve o nó em um frame com auto layout, no mesmo lugar (Shift+A do Figma). */
function wrapInAutoLayout(doc: Doc, id: NodeId): { doc: Doc; id: NodeId } {
  const node = doc.nodes[id]
  if (!node?.parentId) return { doc, id }
  const abs = node.layout.position === 'absolute'
  const wrapper = createNode('frame', {
    name: 'Auto layout',
    layout: {
      mode: 'vertical',
      gap: 8,
      padding: [0, 0, 0, 0],
      width: { type: 'hug' },
      height: { type: 'hug' },
      ...(abs ? { position: 'absolute', x: node.layout.x, y: node.layout.y } : {}),
    },
    style: { fill: undefined, radius: undefined },
  })
  const index = doc.nodes[node.parentId].children.indexOf(id)
  let next = insertNodes(doc, [wrapper], node.parentId, index)
  next = moveNode(next, id, wrapper.id, 0)
  if (abs) next = updateNode(next, id, { layout: { position: 'auto' } })
  return { doc: next, id: wrapper.id }
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest?.('input, textarea, select, [contenteditable]')) return

      const s = editor.get()
      // valores como aparecem no breakpoint ativo
      const sel = s.selection && s.doc.nodes[s.selection] ? resolveNode(s.doc, s.doc.nodes[s.selection], s.breakpoint) : null
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        editor.redo()
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        if (!sel?.parentId) return
        let newId = sel.id
        editor.commit((doc) => {
          const r = duplicateNode(doc, sel.id)
          newId = r.id
          return r.doc
        })
        editor.set({ selection: newId })
        return
      }
      if (mod) {
        if (key === '=' || key === '+') {
          e.preventDefault()
          zoomBy(1.25)
        }
        if (key === '-') {
          e.preventDefault()
          zoomBy(0.8)
        }
        return
      }

      if (e.code === 'Digit1' && e.shiftKey) return fitToScreen()
      if (e.code === 'Digit2' && e.shiftKey) return fitFrame()

      if (e.shiftKey && key === 'a' && sel) {
        e.preventDefault()
        if (sel.type === 'frame') {
          editor.patch(sel.id, { layout: { mode: sel.layout.mode === 'none' ? 'vertical' : 'none' } })
        } else {
          let wrapperId = sel.id
          editor.commit((doc) => {
            const r = wrapInAutoLayout(doc, sel.id)
            wrapperId = r.id
            return r.doc
          })
          editor.set({ selection: wrapperId })
        }
        return
      }

      if (e.shiftKey && key === 'r') {
        editor.set({ showRulers: !s.showRulers })
        return
      }

      if (key in TOOL_KEYS && !e.shiftKey) {
        editor.set({ tool: TOOL_KEYS[key as keyof typeof TOOL_KEYS], drop: null })
        return
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (sel?.parentId) {
            e.preventDefault()
            editor.commit((doc) => removeNode(doc, sel.id))
            editor.set({ selection: sel.parentId })
          }
          break
        case 'Escape':
          if (s.tool !== 'move') editor.set({ tool: 'move', drop: null })
          else if (sel) editor.set({ selection: sel.parentId })
          break
        case 'Enter':
          if (!sel) break
          e.preventDefault()
          if (e.shiftKey) editor.set({ selection: sel.parentId ?? sel.id })
          else if (sel.type === 'text') editor.set({ editingId: sel.id })
          else if (sel.children.length) editor.set({ selection: sel.children[0] })
          break
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (!sel?.parentId) break
          e.preventDefault()
          const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'
          if (sel.layout.position === 'absolute') {
            // nudge: 1px, ou 10px com Shift
            const step = (forward ? 1 : -1) * (e.shiftKey ? 10 : 1)
            const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown'
            editor.patch(sel.id, { layout: vertical ? { y: sel.layout.y + step } : { x: sel.layout.x + step } })
          } else {
            // em auto layout, as setas reordenam entre os irmãos
            const siblings = s.doc.nodes[sel.parentId].children
            const index = siblings.indexOf(sel.id) + (forward ? 1 : -1)
            if (index < 0 || index >= siblings.length) break
            editor.commit((doc) => moveNode(doc, sel.id, sel.parentId!, index))
          }
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App() {
  useShortcuts()
  return (
    <div className="app">
      <Toolbar />
      <LayersPanel />
      <Canvas />
      <PropertiesPanel />
    </div>
  )
}
