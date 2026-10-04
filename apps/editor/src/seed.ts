import {
  createDoc,
  type Doc,
  type Layout,
  type NodeOverride,
  type NodeSpec,
  type Sizing,
  type Style,
  type TextTag,
} from '@cms/core'

const FILL: Sizing = { type: 'fill' }
const fixed = (value: number): Sizing => ({ type: 'fixed', value })

type Responsive = { tablet?: NodeOverride; mobile?: NodeOverride }

const frame = (
  name: string,
  layout: Partial<Layout>,
  style: Style,
  children: NodeSpec[] = [],
  overrides?: Responsive,
): NodeSpec => ({
  type: 'frame',
  name,
  layout: { width: { type: 'hug' }, height: { type: 'hug' }, gap: 0, padding: [0, 0, 0, 0], ...layout },
  style: { fill: undefined, radius: undefined, ...style },
  children,
  overrides,
})

const text = (
  content: string,
  style: Style,
  opts: { name?: string; tag?: TextTag; layout?: Partial<Layout>; overrides?: Responsive } = {},
): NodeSpec => ({
  type: 'text',
  name: opts.name ?? content.slice(0, 28),
  props: { text: content, tag: opts.tag ?? 'p' },
  layout: opts.layout,
  style,
  overrides: opts.overrides,
})

const button = (
  label: string,
  bg: string,
  color: string,
  radius: number,
  pad: number,
  extra: Style = {},
  overrides?: Responsive,
) =>
  frame(
    `Botão ${label}`,
    { mode: 'horizontal', padding: [pad, pad * 1.75, pad, pad * 1.75], crossAlign: 'center', mainAlign: 'center' },
    { fill: bg, radius, ...extra },
    [text(label, { fontSize: 15, fontWeight: 600, color })],
    overrides,
  )

const card = (title: string, body: string) =>
  frame(
    `Card ${title}`,
    { mode: 'vertical', width: FILL, height: FILL, gap: 12, padding: [28, 28, 28, 28] },
    { fill: '#fafafa', radius: 16, stroke: { color: '#ececec', width: 1 } },
    [
      text(title, { fontSize: 20, fontWeight: 700, color: '#111827' }, { tag: 'h3' }),
      text(body, { fontSize: 15, color: '#6b7280', lineHeight: 1.55 }, { layout: { width: FILL } }),
    ],
    { mobile: { layout: { padding: [22, 22, 22, 22] } } },
  )

const LINK: Style = { fontSize: 15, color: '#4b5563' }
const FOOT: Style = { fontSize: 14, color: '#9ca3af' }
const HIDE_ON_MOBILE: Responsive = { mobile: { layout: { hidden: true } } }
const FULL_WIDTH_ON_MOBILE: Responsive = { mobile: { layout: { width: FILL } } }

export function createSeedDoc(): Doc {
  return createDoc(
    frame('Página', { mode: 'vertical', width: fixed(1280) }, { fill: '#ffffff' }, [
      frame(
        'Navegação',
        { mode: 'horizontal', width: FILL, padding: [20, 48, 20, 48], mainAlign: 'space-between', crossAlign: 'center' },
        {},
        [
          text('Aurora', { fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: -0.5 }, { name: 'Logo' }),
          frame('Links', { mode: 'horizontal', gap: 32, crossAlign: 'center' }, {}, [
            text('Produto', LINK, { overrides: HIDE_ON_MOBILE }),
            text('Preços', LINK, { overrides: HIDE_ON_MOBILE }),
            text('Blog', LINK, { overrides: HIDE_ON_MOBILE }),
            button('Começar', '#111827', '#ffffff', 999, 10),
          ], { tablet: { layout: { gap: 24 } } }),
        ],
        {
          tablet: { layout: { padding: [16, 32, 16, 32] } },
          mobile: { layout: { padding: [14, 20, 14, 20] } },
        },
      ),
      frame(
        'Hero',
        { mode: 'vertical', width: FILL, gap: 24, padding: [112, 48, 112, 48], crossAlign: 'center' },
        { fill: '#f5f3ff', clip: true },
        [
          frame(
            'Selo (absoluto)',
            { mode: 'horizontal', position: 'absolute', x: 1010, y: 40, padding: [6, 12, 6, 12] },
            { fill: '#ddd6fe', radius: 999 },
            [text('Novo ✦ editor visual', { fontSize: 13, fontWeight: 600, color: '#5b21b6' })],
            {
              tablet: { layout: { x: 585, y: 28 } },
              // no celular o selo volta para o fluxo, acima do título
              mobile: { layout: { position: 'auto' } },
            },
          ),
          text(
            'Crie sites como quem desenha',
            { fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5, textAlign: 'center', color: '#111827' },
            {
              name: 'Título',
              tag: 'h1',
              layout: { width: fixed(760) },
              overrides: {
                tablet: { layout: { width: FILL }, style: { fontSize: 52 } },
                mobile: { style: { fontSize: 38, letterSpacing: -1 } },
              },
            },
          ),
          text(
            'Arraste, solte e publique. O layout continua responsivo por baixo dos panos.',
            { fontSize: 20, lineHeight: 1.5, textAlign: 'center', color: '#4b5563' },
            {
              name: 'Subtítulo',
              layout: { width: fixed(560) },
              overrides: { mobile: { layout: { width: FILL }, style: { fontSize: 17 } } },
            },
          ),
          frame(
            'Ações',
            { mode: 'horizontal', gap: 12 },
            {},
            [
              button('Começar grátis', '#7c3aed', '#ffffff', 10, 14, {}, FULL_WIDTH_ON_MOBILE),
              button('Ver demo', '#ffffff', '#111827', 10, 14, { stroke: { color: '#e5e7eb', width: 1 } }, FULL_WIDTH_ON_MOBILE),
            ],
            { mobile: { layout: { mode: 'vertical', width: FILL } } },
          ),
        ],
        {
          tablet: { layout: { padding: [88, 32, 88, 32] } },
          mobile: { layout: { padding: [48, 20, 56, 20], gap: 20 } },
        },
      ),
      frame(
        'Recursos',
        { mode: 'horizontal', width: FILL, gap: 24, padding: [80, 48, 40, 48] },
        {},
        [
          card('Canvas infinito', 'Pan, zoom e seleção como no Figma. Clique para entrar nos grupos, Ctrl+clique para ir direto ao elemento.'),
          card('Auto layout', 'Hug, fill e fixed viram flexbox de verdade. O que você vê no canvas é o HTML publicado.'),
          card('Documento em JSON', 'A mesma árvore alimenta o editor e os renderers: HTML hoje, Astro em seguida.'),
        ],
        {
          tablet: { layout: { gap: 16, padding: [64, 32, 32, 32] } },
          mobile: { layout: { mode: 'vertical', padding: [48, 20, 24, 20] } },
        },
      ),
      frame(
        'Vitrine',
        { mode: 'vertical', width: FILL, padding: [40, 48, 80, 48] },
        {},
        [
          {
            type: 'image',
            name: 'Imagem destaque',
            layout: { width: FILL, height: fixed(420) },
            style: { radius: 16 },
            overrides: { tablet: { layout: { height: fixed(320) } }, mobile: { layout: { height: fixed(220) } } },
          },
        ],
        {
          tablet: { layout: { padding: [32, 32, 64, 32] } },
          mobile: { layout: { padding: [24, 20, 48, 20] } },
        },
      ),
      frame(
        'Rodapé',
        { mode: 'horizontal', width: FILL, padding: [32, 48, 32, 48], mainAlign: 'space-between', crossAlign: 'center' },
        { fill: '#111827' },
        [text('© 2026 Aurora', FOOT), text('Feito com o editor', FOOT)],
        {
          tablet: { layout: { padding: [28, 32, 28, 32] } },
          mobile: { layout: { mode: 'vertical', mainAlign: 'start', crossAlign: 'start', gap: 6, padding: [24, 20, 24, 20] } },
        },
      ),
    ]),
  )
}
