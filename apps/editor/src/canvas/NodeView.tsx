import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { nodeStyle, resolveNode, updateNode, type Node, type NodeId } from '@cms/core'
import { editor, useEditor } from '../store'

/** Renderiza o nó como ele fica no breakpoint `bp` (base + overrides da cascata). */
export const NodeView = memo(function NodeView({ id, bp }: { id: NodeId; bp: string }) {
  const breakpoints = useEditor((s) => s.doc.breakpoints)
  const raw = useEditor((s) => s.doc.nodes[id])
  const rawParent = useEditor((s) => {
    const p = s.doc.nodes[id]?.parentId
    return p ? s.doc.nodes[p] : null
  })
  const dragging = useEditor((s) => s.draggingId === id)
  const editing = useEditor((s) => s.editingId === id && s.breakpoint === bp)

  const node = useMemo(() => {
    if (!raw) return null
    const n = resolveNode({ breakpoints }, raw, bp)
    if (raw.parentId) return n
    // a raiz de cada frame tem a largura do breakpoint
    const width = breakpoints.find((b) => b.id === bp)?.width ?? 0
    return { ...n, layout: { ...n.layout, width: { type: 'fixed' as const, value: width } } }
  }, [raw, bp, breakpoints])
  const parent = useMemo(
    () => (rawParent ? resolveNode({ breakpoints }, rawParent, bp) : null),
    [rawParent, bp, breakpoints],
  )
  if (!node) return null

  const style = nodeStyle(node, parent, { mode: 'editor' }) as CSSProperties
  if (dragging) style.opacity = 0.35
  const attrs = { 'data-node-id': id, style, className: parent ? undefined : 'page-root' }

  switch (node.type) {
    case 'frame':
      return (
        <div {...attrs}>
          {node.children.map((c) => (
            <NodeView key={c} id={c} bp={bp} />
          ))}
        </div>
      )
    case 'image':
      return <img {...attrs} src={node.props.src} alt={node.props.alt} draggable={false} />
    case 'text':
      // key força remontar ao entrar/sair da edição: o DOM editado pelo usuário nunca é reconciliado pelo React
      return <TextNode key={editing ? 'edit' : 'view'} node={node} attrs={attrs} editing={editing} />
  }
})

function TextNode({ node, attrs, editing }: { node: Node; attrs: Record<string, unknown>; editing: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const Tag = (node.props.tag ?? 'p') as 'p'

  useLayoutEffect(() => {
    const el = ref.current
    if (!editing || !el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editing])

  if (!editing) return <Tag {...attrs}>{node.props.text}</Tag>

  return (
    <Tag
      {...attrs}
      ref={ref}
      className="editing"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      onBlur={(e) => {
        const text = e.currentTarget.innerText
        editor.set({ editingId: null })
        if (text !== node.props.text) editor.commit((doc) => updateNode(doc, node.id, { props: { text } }))
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    >
      {node.props.text}
    </Tag>
  )
}
