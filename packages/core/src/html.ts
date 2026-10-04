import { resolveNode } from './breakpoints'
import { nodeStyle, type StyleMap } from './css'
import type { Doc, Node, NodeId } from './types'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;')
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())

export function styleToCss(style: StyleMap): string {
  return Object.entries(style)
    .map(([k, v]) => `${kebab(k)}:${v}`)
    .join(';')
}

/** Declarações que mudam de `from` para `to`. Propriedades que somem voltam ao padrão com `revert`. */
function diffStyles(from: StyleMap, to: StyleMap): string {
  const out: string[] = []
  for (const [k, v] of Object.entries(to)) if (from[k] !== v) out.push(`${kebab(k)}:${v}`)
  for (const k of Object.keys(from)) if (!(k in to)) out.push(`${kebab(k)}:revert`)
  return out.join(';')
}

/**
 * Renderer de referência: documento -> HTML estático.
 * Cada nó vira uma classe; a base vai no CSS normal e cada breakpoint vira uma media query
 * só com o que muda em relação ao breakpoint anterior.
 */
export function renderHtml(doc: Doc, { title = 'Página' } = {}): string {
  const [base, ...rest] = doc.breakpoints
  const baseRules: string[] = []
  const mediaRules = new Map<string, string[]>(rest.map((b) => [b.id, []]))

  const render = (id: NodeId, parent: Node | null): string => {
    const node = doc.nodes[id]
    const cls = `n-${id}`
    let prev: StyleMap | null = null
    for (const bp of [base, ...rest]) {
      const style = nodeStyle(
        resolveNode(doc, node, bp.id),
        parent ? resolveNode(doc, parent, bp.id) : null,
        { mode: 'export' },
      )
      if (!prev) baseRules.push(`.${cls}{${styleToCss(style)}}`)
      else {
        const diff = diffStyles(prev, style)
        if (diff) mediaRules.get(bp.id)!.push(`.${cls}{${diff}}`)
      }
      prev = style
    }

    switch (node.type) {
      case 'frame':
        return `<div class="${cls}">${node.children.map((c) => render(c, node)).join('')}</div>`
      case 'text': {
        const tag = node.props.tag ?? 'p'
        return `<${tag} class="${cls}">${escapeHtml(node.props.text ?? '')}</${tag}>`
      }
      case 'image':
        return `<img class="${cls}" src="${escapeAttr(node.props.src ?? '')}" alt="${escapeAttr(node.props.alt ?? '')}">`
    }
  }

  const body = render(doc.rootId, null)
  const media = rest
    .filter((bp) => bp.maxWidth !== null && mediaRules.get(bp.id)!.length)
    .map((bp) => `@media (max-width:${bp.maxWidth}px){\n${mediaRules.get(bp.id)!.join('\n')}\n}`)

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..900&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}body{-webkit-font-smoothing:antialiased}
${baseRules.join('\n')}
${media.join('\n')}
</style>
</head>
<body>
${body}
</body>
</html>
`
}
