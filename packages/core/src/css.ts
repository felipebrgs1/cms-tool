import type { Node } from './types'

/** Propriedades CSS em camelCase. Lengths já vêm como string com unidade. */
export type StyleMap = Record<string, string | number>

export interface StyleContext {
  /** No editor a raiz tem a largura do breakpoint; no export ela ocupa a página inteira. */
  mode: 'editor' | 'export'
}

export const DEFAULT_FONT = 'Inter, system-ui, sans-serif'

const px = (n: number) => `${n}px`

const MAIN = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' }
const CROSS = { start: 'flex-start', center: 'center', end: 'flex-end' }

/**
 * Traduz o modelo do Figma (auto layout + hug/fill/fixed) para CSS.
 * É a única fonte de verdade de estilo: o editor e todos os renderers usam esta função.
 */
export function nodeStyle(node: Node, parent: Node | null, ctx: StyleContext): StyleMap {
  const s: StyleMap = { boxSizing: 'border-box', margin: 0 }
  const { layout: l, style: st } = node
  const isRoot = parent === null

  if (!isRoot && l.position === 'absolute') {
    s.position = 'absolute'
    s.left = px(l.x)
    s.top = px(l.y)
  } else if (node.type === 'frame') {
    s.position = 'relative'
  }

  if (node.type === 'frame') {
    if (l.mode !== 'none') {
      s.display = 'flex'
      s.flexDirection = l.mode === 'horizontal' ? 'row' : 'column'
      s.justifyContent = MAIN[l.mainAlign]
      s.alignItems = CROSS[l.crossAlign]
      if (l.gap) s.gap = px(l.gap)
      if (l.wrap) s.flexWrap = 'wrap'
      if (l.padding.some(Boolean)) s.padding = l.padding.map(px).join(' ')
    }
  }

  if (isRoot && ctx.mode === 'export') {
    s.width = '100%'
    s.minHeight = '100vh'
  } else {
    sizeAxis(s, 'width', node, parent)
    sizeAxis(s, 'height', node, parent)
  }

  if (st.fill) s.background = st.fill
  if (st.radius) s.borderRadius = px(st.radius)
  // outline com offset negativo = stroke "inside" do Figma, sem afetar o layout
  if (st.stroke?.width) {
    s.outline = `${px(st.stroke.width)} solid ${st.stroke.color}`
    s.outlineOffset = px(-st.stroke.width)
  }
  if (st.opacity !== undefined && st.opacity !== 1) s.opacity = st.opacity
  if (st.clip) s.overflow = 'hidden'

  if (isRoot) s.fontFamily = st.fontFamily ?? DEFAULT_FONT
  else if (st.fontFamily) s.fontFamily = st.fontFamily

  if (node.type === 'text') {
    if (st.color) s.color = st.color
    if (st.fontSize) s.fontSize = px(st.fontSize)
    if (st.fontWeight) s.fontWeight = st.fontWeight
    if (st.lineHeight) s.lineHeight = st.lineHeight
    if (st.letterSpacing) s.letterSpacing = px(st.letterSpacing)
    if (st.textAlign) s.textAlign = st.textAlign
    s.whiteSpace = l.width.type === 'hug' ? 'pre' : 'pre-wrap'
    s.overflowWrap = 'break-word'
  }

  if (node.type === 'image') {
    s.display = 'block'
    s.objectFit = node.props.fit ?? 'cover'
  }

  if (l.hidden) s.display = 'none'

  return s
}

function sizeAxis(s: StyleMap, axis: 'width' | 'height', node: Node, parent: Node | null) {
  const sizing = node.layout[axis]
  const flowParent =
    parent && node.layout.position === 'auto' && parent.layout.mode !== 'none' ? parent : null
  const isMainAxis = flowParent !== null && (flowParent.layout.mode === 'horizontal') === (axis === 'width')
  // Como no Figma: "preencher" no eixo em que o pai se ajusta ao conteúdo não tem espaço para ocupar, vira "ajustar".
  // Acontece quando um breakpoint troca a direção do pai (ex.: cards com altura fill numa coluna no celular).
  const type = sizing.type === 'fill' && isMainAxis && flowParent!.layout[axis].type === 'hug' ? 'hug' : sizing.type

  switch (type) {
    case 'fixed':
      s[axis] = px(sizing.value ?? 0)
      if (isMainAxis) s.flexShrink = 0
      break
    case 'hug':
      if (axis === 'width') s.width = node.type === 'text' ? 'max-content' : 'fit-content'
      if (isMainAxis) s.flexShrink = 0
      break
    case 'fill':
      if (isMainAxis) {
        s.flexGrow = 1
        s.flexShrink = 1
        s.flexBasis = 0
        s[axis === 'width' ? 'minWidth' : 'minHeight'] = 0
      } else if (flowParent) {
        s.alignSelf = 'stretch'
      } else {
        s[axis] = '100%'
      }
      break
  }
}
