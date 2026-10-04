import { useSyncExternalStore } from 'react'
import { createStore, History, migrateDoc, updateNodeAt, type Doc, type NodeId, type NodePatch } from '@cms/core'
import { createSeedDoc } from './seed'

export type Tool = 'move' | 'frame' | 'text' | 'image'
export interface Camera {
  x: number
  y: number
  zoom: number
}
/** Retângulo em coordenadas do viewport (px de tela). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Linha de alinhamento (smart guide), em coordenadas do mundo. axis 'x' = linha vertical em x=pos. */
export interface SnapLine {
  axis: 'x' | 'y'
  pos: number
  from: number
  to: number
}

/** Guia fixa puxada da régua. axis 'x' = linha vertical. */
export interface Guide {
  id: string
  axis: 'x' | 'y'
  pos: number
}

export interface EditorState {
  doc: Doc
  selection: NodeId | null
  hover: NodeId | null
  /** Breakpoint do frame onde está o hover (null = o ativo). */
  hoverBp: string | null
  /** Breakpoint ativo: onde a seleção é desenhada e para onde vão as edições de estilo. */
  breakpoint: string
  tool: Tool
  camera: Camera
  editingId: NodeId | null
  draggingId: NodeId | null
  drop: { parent: Rect; indicator: Rect | null } | null
  snapLines: SnapLine[]
  /** Alt pressionado: mostra distâncias entre a seleção e o elemento sob o cursor. */
  measuring: boolean
  showRulers: boolean
  guides: Guide[]
  draggingGuide: string | null
  canUndo: boolean
  canRedo: boolean
}

const STORAGE_KEY = 'cms:doc:v1'
const GUIDES_KEY = 'cms:guides:v1'

function loadGuides(): Guide[] {
  try {
    const guides = JSON.parse(localStorage.getItem(GUIDES_KEY) ?? '[]')
    return Array.isArray(guides) ? guides : []
  } catch {
    return []
  }
}

function loadDoc(): Doc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const doc = JSON.parse(raw) as Doc
      if (doc?.version === 1 && doc.nodes?.[doc.rootId]) return migrateDoc(doc)
    }
  } catch {
    // storage indisponível ou corrompido: cai no exemplo
  }
  return createSeedDoc()
}

const initialDoc = loadDoc()

const store = createStore<EditorState>({
  doc: initialDoc,
  selection: null,
  hover: null,
  hoverBp: null,
  breakpoint: initialDoc.breakpoints[0].id,
  tool: 'move',
  camera: { x: 0, y: 0, zoom: 1 },
  editingId: null,
  draggingId: null,
  drop: null,
  snapLines: [],
  measuring: false,
  showRulers: true,
  guides: loadGuides(),
  draggingGuide: null,
  canUndo: false,
  canRedo: false,
})

const history = new History<Doc>()
/** Documento no início de um gesto contínuo (arrastar, redimensionar, scrub). Vira um único passo de undo. */
let previewStart: Doc | null = null

function setDoc(doc: Doc) {
  const s = store.get()
  const alive = (id: NodeId | null) => (id && doc.nodes[id] ? id : null)
  store.set({
    ...s,
    doc,
    selection: alive(s.selection),
    hover: alive(s.hover),
    editingId: alive(s.editingId),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  })
}

export const editor = {
  get: store.get,
  subscribe: store.subscribe,

  set(patch: Partial<EditorState>) {
    store.set({ ...store.get(), ...patch })
  },

  /** Alteração discreta: entra no histórico. */
  commit(fn: (doc: Doc) => Doc) {
    editor.endPreview()
    const prev = store.get().doc
    const next = fn(prev)
    if (next === prev) return
    history.push(prev)
    setDoc(next)
  },

  /** Alteração durante um gesto: aplica sem histórico até endPreview(). */
  preview(fn: (doc: Doc) => Doc) {
    const cur = store.get().doc
    previewStart ??= cur
    setDoc(fn(cur))
  },

  endPreview() {
    if (previewStart && previewStart !== store.get().doc) {
      history.push(previewStart)
      setDoc(store.get().doc)
    }
    previewStart = null
  },

  /** Altera layout/estilo do nó no breakpoint ativo (override fora da base). */
  patch(id: NodeId, patch: NodePatch, preview = false) {
    const bp = store.get().breakpoint
    const fn = (doc: Doc) => updateNodeAt(doc, id, patch, bp)
    if (preview) editor.preview(fn)
    else editor.commit(fn)
  },

  undo() {
    editor.endPreview()
    const prev = history.undo(store.get().doc)
    if (prev) setDoc(prev)
  },

  redo() {
    editor.endPreview()
    const next = history.redo(store.get().doc)
    if (next) setDoc(next)
  },
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let lastSaved = store.get().doc
let lastGuides = store.get().guides
store.subscribe(() => {
  const { doc, guides } = store.get()
  if (guides !== lastGuides) {
    lastGuides = guides
    try {
      localStorage.setItem(GUIDES_KEY, JSON.stringify(guides))
    } catch {
      // sem persistência neste navegador
    }
  }
  if (doc === lastSaved) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    lastSaved = doc
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    } catch {
      // sem persistência neste navegador
    }
  }, 300)
})

/** O seletor deve retornar valores estáveis (primitivos ou referências existentes do estado). */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()))
}
