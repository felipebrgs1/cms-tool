import {
  Download,
  ExternalLink,
  Frame,
  Image,
  Monitor,
  MousePointer2,
  Redo2,
  RotateCcw,
  Smartphone,
  Tablet,
  Type,
  Undo2,
} from 'lucide-react'
import { renderHtml } from '@cms/core'
import { editor, useEditor, type Tool } from './store'
import { fitFrame, fitToScreen } from './camera'
import { createSeedDoc } from './seed'

const TOOLS: { id: Tool; icon: typeof Frame; label: string; key: string }[] = [
  { id: 'move', icon: MousePointer2, label: 'Mover', key: 'V' },
  { id: 'frame', icon: Frame, label: 'Frame', key: 'F' },
  { id: 'text', icon: Type, label: 'Texto', key: 'T' },
  { id: 'image', icon: Image, label: 'Imagem', key: 'I' },
]

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Toolbar() {
  const tool = useEditor((s) => s.tool)
  const zoom = useEditor((s) => s.camera.zoom)
  const canUndo = useEditor((s) => s.canUndo)
  const canRedo = useEditor((s) => s.canRedo)
  const breakpoint = useEditor((s) => s.breakpoint)
  const breakpoints = useEditor((s) => s.doc.breakpoints)

  const previewHtml = () => {
    const url = URL.createObjectURL(new Blob([renderHtml(editor.get().doc)], { type: 'text/html' }))
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <header className="toolbar">
      <div className="brand">◆ cms</div>
      <div className="tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool${tool === t.id ? ' active' : ''}`}
            title={`${t.label} (${t.key})`}
            onClick={() => editor.set({ tool: t.id, drop: null })}
          >
            <t.icon size={16} />
          </button>
        ))}
      </div>
      <div className="spacer" />
      <div className="bp-switch">
        {breakpoints.map((bp, i) => {
          const Icon = [Monitor, Tablet, Smartphone][i] ?? Monitor
          return (
            <button
              key={bp.id}
              className={bp.id === breakpoint ? 'active' : ''}
              title={`${bp.name} · ${bp.width}px${bp.maxWidth ? ` (até ${bp.maxWidth}px no site)` : ''}`}
              onClick={() => {
                editor.set({ breakpoint: bp.id })
                fitFrame(bp.id)
              }}
            >
              <Icon size={15} />
              <span>{bp.name}</span>
            </button>
          )
        })}
      </div>
      <div className="spacer" />
      <button className="tool" title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={editor.undo}>
        <Undo2 size={16} />
      </button>
      <button className="tool" title="Refazer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={editor.redo}>
        <Redo2 size={16} />
      </button>
      <button className="zoom" title="Enquadrar tudo (Shift+1)" onClick={fitToScreen}>
        {Math.round(zoom * 100)}%
      </button>
      <div className="divider" />
      <button className="text-btn" title="Abre o HTML gerado pelo renderer em uma nova aba" onClick={previewHtml}>
        <ExternalLink size={14} /> Ver HTML
      </button>
      <button
        className="text-btn"
        title="Baixa o documento (JSON)"
        onClick={() => download('pagina.json', JSON.stringify(editor.get().doc, null, 2), 'application/json')}
      >
        <Download size={14} /> JSON
      </button>
      <button
        className="tool"
        title="Restaurar exemplo"
        onClick={() => {
          editor.commit(() => createSeedDoc())
          editor.set({ selection: null })
        }}
      >
        <RotateCcw size={16} />
      </button>
    </header>
  )
}
