import { memo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Columns3, Eye, EyeOff, Frame, Image, Rows3, Type } from 'lucide-react'
import { resolveNode, updateNode, type Node, type NodeId } from '@cms/core'
import { editor, useEditor } from '../store'

export function LayersPanel() {
  const rootId = useEditor((s) => s.doc.rootId)
  return (
    <aside className="panel layers">
      <div className="panel-title">Camadas</div>
      <LayerRow id={rootId} depth={0} />
    </aside>
  )
}

function NodeIcon({ node }: { node: Node }) {
  if (node.type === 'text') return <Type size={13} />
  if (node.type === 'image') return <Image size={13} />
  if (node.layout.mode === 'horizontal') return <Columns3 size={13} />
  if (node.layout.mode === 'vertical') return <Rows3 size={13} />
  return <Frame size={13} />
}

const LayerRow = memo(function LayerRow({ id, depth }: { id: NodeId; depth: number }) {
  const node = useEditor((s) => s.doc.nodes[id])
  const selected = useEditor((s) => s.selection === id)
  const hovered = useEditor((s) => s.hover === id)
  // visibilidade no breakpoint ativo
  const hidden = useEditor((s) => {
    const n = s.doc.nodes[id]
    return !!n && !!resolveNode(s.doc, n, s.breakpoint).layout.hidden
  })
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const cancelled = useRef(false)
  if (!node) return null

  const finishRename = (name: string) => {
    setRenaming(false)
    if (!cancelled.current && name.trim() && name !== node.name) {
      editor.commit((doc) => updateNode(doc, id, { name: name.trim() }))
    }
    cancelled.current = false
  }

  return (
    <>
      <div
        className={`layer-row${selected ? ' selected' : ''}${hovered ? ' hovered' : ''}${hidden ? ' hidden' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => editor.set({ selection: id })}
        onDoubleClick={() => setRenaming(true)}
        onPointerEnter={() => editor.set({ hover: id, hoverBp: null })}
        onPointerLeave={() => editor.set({ hover: null })}
      >
        <button
          className="twisty"
          style={{ visibility: node.children.length ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!open)
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="layer-icon">
          <NodeIcon node={node} />
        </span>
        {renaming ? (
          <input
            className="rename"
            autoFocus
            defaultValue={node.name}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => finishRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                cancelled.current = true
                e.currentTarget.blur()
              }
            }}
          />
        ) : (
          <span className={`layer-name${node.layout.position === 'absolute' ? ' absolute' : ''}`}>{node.name}</span>
        )}
        {node.parentId && (
          <button
            className="eye"
            title={hidden ? 'Mostrar neste breakpoint' : 'Ocultar neste breakpoint'}
            onClick={(e) => {
              e.stopPropagation()
              editor.patch(id, { layout: { hidden: !hidden } })
            }}
          >
            {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
      {open && node.children.map((c) => <LayerRow key={c} id={c} depth={depth + 1} />)}
    </>
  )
})
