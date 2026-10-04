export type NodeId = string
export type NodeType = 'frame' | 'text' | 'image'

/** Modelo de dimensionamento do Figma: hug = conteúdo, fill = ocupa o espaço do pai, fixed = valor em px. */
export interface Sizing {
  type: 'hug' | 'fill' | 'fixed'
  value?: number
}

export type LayoutMode = 'none' | 'horizontal' | 'vertical'
export type MainAlign = 'start' | 'center' | 'end' | 'space-between'
export type CrossAlign = 'start' | 'center' | 'end'
/** [top, right, bottom, left] */
export type Padding = [number, number, number, number]

export interface Layout {
  /** Auto layout do próprio nó (como ele organiza os filhos). */
  mode: LayoutMode
  gap: number
  padding: Padding
  mainAlign: MainAlign
  crossAlign: CrossAlign
  wrap: boolean
  /** Como o nó se dimensiona dentro do pai. */
  width: Sizing
  height: Sizing
  /** absolute = sai do fluxo e usa x/y relativos ao pai. */
  position: 'auto' | 'absolute'
  x: number
  y: number
  /** Oculto (display: none). Útil principalmente por breakpoint. */
  hidden?: boolean
}

export interface Style {
  fill?: string
  radius?: number
  stroke?: { color: string; width: number }
  opacity?: number
  clip?: boolean
  color?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right'
}

export type TextTag = 'h1' | 'h2' | 'h3' | 'p' | 'span'

export interface NodeProps {
  text?: string
  tag?: TextTag
  src?: string
  alt?: string
  fit?: 'cover' | 'contain'
}

/**
 * Diferenças de um breakpoint em relação ao anterior na cascata.
 * null = "remove neste breakpoint" (undefined não sobrevive ao JSON).
 */
export interface NodeOverride {
  layout?: { [K in keyof Layout]?: Layout[K] | null }
  style?: { [K in keyof Style]?: Style[K] | null }
}

/**
 * O primeiro breakpoint é a base (desktop). Os demais são desktop-first:
 * cada um herda do anterior e vale abaixo de `maxWidth`.
 */
export interface Breakpoint {
  id: string
  name: string
  /** Largura do frame de preview no editor. */
  width: number
  /** Limite da media query no site publicado (null na base). */
  maxWidth: number | null
}

export interface Node {
  id: NodeId
  type: NodeType
  name: string
  parentId: NodeId | null
  children: NodeId[]
  props: NodeProps
  layout: Layout
  style: Style
  overrides?: Record<string, NodeOverride>
}

export interface Doc {
  version: 1
  rootId: NodeId
  breakpoints: Breakpoint[]
  nodes: Record<NodeId, Node>
}

export interface NodePatch {
  name?: string
  props?: Partial<NodeProps>
  layout?: Partial<Layout>
  style?: Partial<Style>
}
