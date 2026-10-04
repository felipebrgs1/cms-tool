import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  Ban,
  Plus,
} from 'lucide-react'
import { useMemo } from 'react'
import {
  clearOverrides,
  overriddenKeys,
  resolveNode,
  type CrossAlign,
  type MainAlign,
  type Node,
  type NodePatch,
  type OverrideKeys,
  type Padding,
} from '@cms/core'
import { editor, useEditor } from '../store'
import { nodeElement } from '../canvas/geometry'
import { ColorField, NumberField, OverrideContext, Section, Segmented, Select, TextField } from './fields'

type Apply = (patch: NodePatch, preview?: boolean) => void

const FONTS = [
  { value: '', label: 'Padrão (Inter)' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'ui-monospace, monospace', label: 'Monospace' },
  { value: 'system-ui, sans-serif', label: 'Sistema' },
]
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: String(w) }))

const KEYS = {
  position: { layout: ['position', 'x', 'y'] },
  size: { layout: ['width', 'height'] },
  autoLayout: { layout: ['mode', 'gap', 'padding', 'mainAlign', 'crossAlign', 'wrap'] },
  visibility: { layout: ['hidden'] },
  text: { style: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'color'] },
  appearance: { style: ['radius', 'opacity', 'clip'] },
  fill: { style: ['fill'] },
  stroke: { style: ['stroke'] },
} satisfies Record<string, OverrideKeys>

/** Tamanho renderizado em unidades do documento (para hug/fill, que não têm valor próprio). */
function measured(id: string, axis: 'width' | 'height') {
  const el = nodeElement(id)
  if (!el) return 100
  const r = el.getBoundingClientRect()
  return Math.round((axis === 'width' ? r.width : r.height) / editor.get().camera.zoom)
}

export function PropertiesPanel() {
  const raw = useEditor((s) => (s.selection ? s.doc.nodes[s.selection] : null))
  const rawParent = useEditor((s) => {
    const p = s.selection ? s.doc.nodes[s.selection]?.parentId : null
    return p ? s.doc.nodes[p] : null
  })
  const bp = useEditor((s) => s.breakpoint)
  const breakpoints = useEditor((s) => s.doc.breakpoints)
  // o painel mostra os valores como ficam no breakpoint ativo
  const node = useMemo(() => (raw ? resolveNode({ breakpoints }, raw, bp) : null), [raw, bp, breakpoints])
  const parent = useMemo(() => (rawParent ? resolveNode({ breakpoints }, rawParent, bp) : null), [rawParent, bp, breakpoints])

  if (!node) {
    return (
      <aside className="panel props">
        <div className="empty">
          <p>Selecione um elemento no canvas.</p>
          <dl className="shortcuts">
            <dt>Clique</dt><dd>seleciona / entra no grupo</dd>
            <dt>Ctrl + clique</dt><dd>seleciona o mais profundo</dd>
            <dt>Duplo clique</dt><dd>edita texto</dd>
            <dt>Espaço + arrastar</dt><dd>move o canvas</dd>
            <dt>Ctrl + scroll</dt><dd>zoom</dd>
            <dt>F · T · I</dt><dd>frame · texto · imagem</dd>
            <dt>Shift + A</dt><dd>alterna auto layout</dd>
            <dt>Setas</dt><dd>reordena / move</dd>
            <dt>Enter · Esc</dt><dd>filho · pai</dd>
            <dt>Ctrl + D</dt><dd>duplica</dd>
            <dt>Shift + 1 · 2</dt><dd>enquadrar tudo · frame ativo</dd>
            <dt>Alt</dt><dd>mede distâncias</dd>
            <dt>Ctrl ao arrastar</dt><dd>desliga o snap</dd>
            <dt>Shift + R</dt><dd>mostra/oculta réguas</dd>
            <dt>Arrastar da régua</dt><dd>cria guia</dd>
          </dl>
        </div>
      </aside>
    )
  }

  const apply: Apply = (patch, preview) => editor.patch(node.id, patch, preview)
  const bpInfo = breakpoints.find((b) => b.id === bp) ?? breakpoints[0]
  const isBase = bpInfo.id === breakpoints[0].id
  const own = overriddenKeys(raw!, bp)
  const overrideCount = own.layout.size + own.style.size
  const overrides = {
    bpName: bpInfo.name,
    isOverridden: (keys: OverrideKeys) =>
      !isBase && !!(keys.layout?.some((k) => own.layout.has(k)) || keys.style?.some((k) => own.style.has(k))),
    reset: (keys: OverrideKeys) => editor.commit((doc) => clearOverrides(doc, node.id, bp, keys)),
  }

  return (
    <aside className="panel props" key={node.id}>
      <Section title={TYPE_LABEL[node.type]}>
        <TextField value={node.name} onChange={(name) => apply({ name })} />
      </Section>
      <div className={`bp-banner${isBase ? '' : ' override'}`}>
        <span>
          {isBase ? (
            <>Editando <b>{bpInfo.name}</b>: a base dos outros breakpoints.</>
          ) : (
            <>Editando <b>{bpInfo.name}</b>: os ajustes valem só daqui para baixo.</>
          )}
        </span>
        {overrideCount > 0 && (
          <button onClick={() => editor.commit((doc) => clearOverrides(doc, node.id, bp))}>
            Limpar {overrideCount} {overrideCount === 1 ? 'ajuste' : 'ajustes'}
          </button>
        )}
      </div>
      <OverrideContext.Provider value={overrides}>
        <PanelSections node={node} parent={parent} apply={apply} bpName={bpInfo.name} isBase={isBase} />
      </OverrideContext.Provider>
    </aside>
  )
}

function PanelSections({
  node,
  parent,
  apply,
  bpName,
  isBase,
}: {
  node: Node
  parent: Node | null
  apply: Apply
  bpName: string
  isBase: boolean
}) {
  return (
    <>
      {parent && (
        <Section title="Visibilidade" keys={KEYS.visibility}>
          <label className="check">
            <input
              type="checkbox"
              checked={!!node.layout.hidden}
              onChange={(e) => apply({ layout: { hidden: e.target.checked } })}
            />
            {isBase ? 'Oculto em todos os breakpoints' : `Oculto no ${bpName}`}
          </label>
        </Section>
      )}
      {parent && <PositionSection node={node} parent={parent} apply={apply} />}
      <SizeSection node={node} parent={parent} apply={apply} />
      {node.type === 'frame' && <AutoLayoutSection node={node} apply={apply} />}
      {node.type === 'text' && <TextSection node={node} apply={apply} />}
      {node.type === 'image' && <ImageSection node={node} apply={apply} />}
      <AppearanceSection node={node} apply={apply} />
    </>
  )
}

const TYPE_LABEL = { frame: 'Frame', text: 'Texto', image: 'Imagem' }

function PositionSection({ node, parent, apply }: { node: Node; parent: Node; apply: Apply }) {
  const l = node.layout
  const toAbsolute = () => {
    const el = nodeElement(node.id)
    const pel = nodeElement(parent.id)
    const zoom = editor.get().camera.zoom
    if (!el || !pel) return apply({ layout: { position: 'absolute' } })
    const r = el.getBoundingClientRect()
    const pr = pel.getBoundingClientRect()
    apply({
      layout: {
        position: 'absolute',
        x: Math.round((r.left - pr.left) / zoom),
        y: Math.round((r.top - pr.top) / zoom),
      },
    })
  }
  return (
    <Section title="Posição" keys={KEYS.position}>
      <Segmented
        value={l.position}
        options={[
          { value: 'auto', label: 'No fluxo' },
          { value: 'absolute', label: 'Absoluta' },
        ]}
        onChange={(p) => (p === 'absolute' ? toAbsolute() : apply({ layout: { position: 'auto' } }))}
      />
      {l.position === 'absolute' && (
        <div className="row">
          <NumberField label="X" value={l.x} onChange={(x, p) => apply({ layout: { x } }, p)} />
          <NumberField label="Y" value={l.y} onChange={(y, p) => apply({ layout: { y } }, p)} />
        </div>
      )}
    </Section>
  )
}

function SizeSection({ node, parent, apply }: { node: Node; parent: Node | null; apply: Apply }) {
  const canHug = node.type === 'text' || (node.type === 'frame' && node.layout.mode !== 'none')
  const field = (axis: 'width' | 'height', label: string) => {
    const sizing = node.layout[axis]
    const options = [
      { value: 'fixed' as const, label: 'Fixo' },
      ...(canHug || sizing.type === 'hug' ? [{ value: 'hug' as const, label: 'Ajustar' }] : []),
      ...(parent || sizing.type === 'fill' ? [{ value: 'fill' as const, label: 'Preencher' }] : []),
    ]
    return (
      <div className="sizing">
        <NumberField
          label={label}
          min={1}
          dim={sizing.type !== 'fixed'}
          value={sizing.type === 'fixed' ? (sizing.value ?? 0) : measured(node.id, axis)}
          onChange={(value, p) => apply({ layout: { [axis]: { type: 'fixed', value } } }, p)}
        />
        <Select
          value={sizing.type}
          options={options}
          onChange={(type) =>
            apply({
              layout: { [axis]: type === 'fixed' ? { type, value: measured(node.id, axis) } : { type } },
            })
          }
        />
      </div>
    )
  }
  return (
    <Section title="Tamanho" keys={KEYS.size}>
      {field('width', 'L')}
      {field('height', 'A')}
    </Section>
  )
}

function AutoLayoutSection({ node, apply }: { node: Node; apply: Apply }) {
  const l = node.layout
  const pad = (i: number) => (v: number, p?: boolean) => {
    const padding = [...l.padding] as Padding
    padding[i] = v
    apply({ layout: { padding } }, p)
  }
  return (
    <Section title="Auto layout" keys={KEYS.autoLayout}>
      <Segmented
        value={l.mode}
        options={[
          { value: 'none', label: <Ban size={14} />, title: 'Sem auto layout (filhos absolutos)' },
          { value: 'horizontal', label: <ArrowRight size={14} />, title: 'Horizontal' },
          { value: 'vertical', label: <ArrowDown size={14} />, title: 'Vertical' },
        ]}
        onChange={(mode) => apply({ layout: { mode } })}
      />
      {l.mode !== 'none' && (
        <>
          <div className="align-row">
            <AlignGrid node={node} apply={apply} />
            <div className="align-side">
              <NumberField label="Gap" min={0} value={l.gap} onChange={(gap, p) => apply({ layout: { gap } }, p)} />
              <label className="check">
                <input
                  type="checkbox"
                  checked={l.mainAlign === 'space-between'}
                  onChange={(e) => apply({ layout: { mainAlign: e.target.checked ? 'space-between' : 'start' } })}
                />
                Distribuir
              </label>
              {l.mode === 'horizontal' && (
                <label className="check">
                  <input type="checkbox" checked={l.wrap} onChange={(e) => apply({ layout: { wrap: e.target.checked } })} />
                  Quebrar linha
                </label>
              )}
            </div>
          </div>
          <div className="row">
            <NumberField label="↑" title="Padding superior" min={0} value={l.padding[0]} onChange={pad(0)} />
            <NumberField label="→" title="Padding direito" min={0} value={l.padding[1]} onChange={pad(1)} />
            <NumberField label="↓" title="Padding inferior" min={0} value={l.padding[2]} onChange={pad(2)} />
            <NumberField label="←" title="Padding esquerdo" min={0} value={l.padding[3]} onChange={pad(3)} />
          </div>
        </>
      )}
    </Section>
  )
}

/** Grade 3×3 do Figma: cada célula define o alinhamento nos dois eixos de uma vez. */
function AlignGrid({ node, apply }: { node: Node; apply: Apply }) {
  const l = node.layout
  const steps = ['start', 'center', 'end'] as const
  const horizontal = l.mode === 'horizontal'
  return (
    <div className="align-grid">
      {steps.map((row) =>
        steps.map((col) => {
          const main = (horizontal ? col : row) as MainAlign
          const cross = (horizontal ? row : col) as CrossAlign
          const active = l.crossAlign === cross && (l.mainAlign === main || l.mainAlign === 'space-between')
          return (
            <button
              key={row + col}
              className={active ? 'active' : ''}
              title={`${main} / ${cross}`}
              onClick={() =>
                apply({
                  layout: { crossAlign: cross, mainAlign: l.mainAlign === 'space-between' ? 'space-between' : main },
                })
              }
            >
              <span />
            </button>
          )
        }),
      )}
    </div>
  )
}

function TextSection({ node, apply }: { node: Node; apply: Apply }) {
  const st = node.style
  return (
    <Section title="Texto" keys={KEYS.text}>
      <TextField multiline value={node.props.text ?? ''} onChange={(text) => apply({ props: { text } })} />
      <div className="row">
        <Select
          value={node.props.tag ?? 'p'}
          options={['h1', 'h2', 'h3', 'p', 'span'].map((t) => ({ value: t as 'p', label: t.toUpperCase() }))}
          onChange={(tag) => apply({ props: { tag } })}
        />
        <Select
          value={st.fontFamily ?? ''}
          options={FONTS}
          onChange={(f) => apply({ style: { fontFamily: f || undefined } })}
        />
      </div>
      <div className="row">
        <NumberField label="Tam" min={1} value={st.fontSize ?? 16} onChange={(fontSize, p) => apply({ style: { fontSize } }, p)} />
        <Select
          value={String(st.fontWeight ?? 400)}
          options={WEIGHTS}
          onChange={(w) => apply({ style: { fontWeight: Number(w) } })}
        />
        <NumberField
          label="Alt"
          title="Altura da linha"
          min={0.5}
          step={0.05}
          value={st.lineHeight ?? 1.4}
          onChange={(lineHeight, p) => apply({ style: { lineHeight } }, p)}
        />
        <NumberField
          label="Esp"
          title="Espaçamento entre letras"
          step={0.1}
          value={st.letterSpacing ?? 0}
          onChange={(letterSpacing, p) => apply({ style: { letterSpacing } }, p)}
        />
      </div>
      <Segmented
        value={st.textAlign ?? 'left'}
        options={[
          { value: 'left', label: <AlignLeft size={14} /> },
          { value: 'center', label: <AlignCenter size={14} /> },
          { value: 'right', label: <AlignRight size={14} /> },
        ]}
        onChange={(textAlign) => apply({ style: { textAlign } })}
      />
      <ColorField value={st.color ?? '#000000'} onChange={(color, p) => apply({ style: { color } }, p)} />
    </Section>
  )
}

function ImageSection({ node, apply }: { node: Node; apply: Apply }) {
  return (
    <Section title="Imagem">
      <TextField placeholder="URL da imagem" value={node.props.src ?? ''} onChange={(src) => apply({ props: { src } })} />
      <TextField placeholder="Texto alternativo" value={node.props.alt ?? ''} onChange={(alt) => apply({ props: { alt } })} />
      <Segmented
        value={node.props.fit ?? 'cover'}
        options={[
          { value: 'cover', label: 'Cobrir' },
          { value: 'contain', label: 'Conter' },
        ]}
        onChange={(fit) => apply({ props: { fit } })}
      />
    </Section>
  )
}

function AppearanceSection({ node, apply }: { node: Node; apply: Apply }) {
  const st = node.style
  const add = (onClick: () => void) => (
    <button className="icon-btn" title="Adicionar" onClick={onClick}>
      <Plus size={14} />
    </button>
  )
  return (
    <>
      <Section title="Aparência" keys={KEYS.appearance}>
        <div className="row">
          <NumberField label="Raio" min={0} value={st.radius ?? 0} onChange={(radius, p) => apply({ style: { radius } }, p)} />
          <NumberField
            label="%"
            title="Opacidade"
            min={0}
            max={100}
            value={Math.round((st.opacity ?? 1) * 100)}
            onChange={(v, p) => apply({ style: { opacity: v / 100 } }, p)}
          />
        </div>
        {node.type === 'frame' && (
          <label className="check">
            <input type="checkbox" checked={!!st.clip} onChange={(e) => apply({ style: { clip: e.target.checked } })} />
            Cortar conteúdo
          </label>
        )}
      </Section>
      {node.type !== 'text' && (
        <Section title="Preenchimento" keys={KEYS.fill} action={!st.fill && add(() => apply({ style: { fill: '#e9e9ef' } }))}>
          {st.fill && (
            <ColorField
              value={st.fill}
              onChange={(fill, p) => apply({ style: { fill } }, p)}
              onRemove={() => apply({ style: { fill: undefined } })}
            />
          )}
        </Section>
      )}
      <Section
        title="Borda"
        keys={KEYS.stroke}
        action={!st.stroke && add(() => apply({ style: { stroke: { color: '#d4d4d8', width: 1 } } }))}
      >
        {st.stroke && (
          <>
            <ColorField
              value={st.stroke.color}
              onChange={(color, p) => apply({ style: { stroke: { ...st.stroke!, color } } }, p)}
              onRemove={() => apply({ style: { stroke: undefined } })}
            />
            <NumberField
              label="Esp"
              min={0}
              value={st.stroke.width}
              onChange={(width, p) => apply({ style: { stroke: { ...st.stroke!, width } } }, p)}
            />
          </>
        )}
      </Section>
    </>
  )
}
