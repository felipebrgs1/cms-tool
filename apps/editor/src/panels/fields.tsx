import { createContext, useContext, useState, type ReactNode } from 'react'
import { Minus, RotateCcw } from 'lucide-react'
import type { OverrideKeys } from '@cms/core'
import { editor } from '../store'

/** Informa às seções quais propriedades foram ajustadas no breakpoint ativo. */
export const OverrideContext = createContext<{
  bpName: string
  isOverridden: (keys: OverrideKeys) => boolean
  reset: (keys: OverrideKeys) => void
} | null>(null)

export function Section({
  title,
  children,
  action,
  keys,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
  /** Propriedades da seção; se alguma tiver override no breakpoint ativo, a seção é marcada. */
  keys?: OverrideKeys
}) {
  const ov = useContext(OverrideContext)
  const overridden = !!(keys && ov?.isOverridden(keys))
  return (
    <section className="section">
      <div className="section-title">
        <span className={overridden ? 'overridden' : undefined}>
          {title}
          {overridden && <span className="ov-dot" title={`Ajustado no ${ov!.bpName}`} />}
        </span>
        <span className="section-actions">
          {overridden && (
            <button
              className="icon-btn"
              title={`Remover ajuste do ${ov!.bpName} (volta a herdar)`}
              onClick={() => ov!.reset(keys!)}
            >
              <RotateCcw size={12} />
            </button>
          )}
          {action}
        </span>
      </div>
      {children}
    </section>
  )
}

/**
 * Campo numérico estilo Figma: digita e confirma com Enter/blur, setas incrementam,
 * arrastar o rótulo faz "scrub" (vira um único passo de undo).
 */
export function NumberField({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  dim = false,
  title,
}: {
  label: ReactNode
  value: number
  onChange: (v: number, preview?: boolean) => void
  min?: number
  max?: number
  step?: number
  dim?: boolean
  title?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const fmt = (v: number) => String(Number(v.toFixed(2)))

  const commit = (raw: string) => {
    setDraft(null)
    const v = Number(raw.replace(',', '.'))
    if (raw.trim() !== '' && Number.isFinite(v) && clamp(v) !== value) onChange(clamp(v))
  }

  const scrub = (e: React.PointerEvent) => {
    e.preventDefault()
    const sx = e.clientX
    const start = value
    let moved = false
    const move = (ev: PointerEvent) => {
      moved = true
      onChange(clamp(start + Math.round((ev.clientX - sx) / 2) * step), true)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (moved) editor.endPreview()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <label className={`num${dim ? ' dim' : ''}`} title={title}>
      <span className="num-label" onPointerDown={scrub}>
        {label}
      </span>
      <input
        value={draft ?? fmt(value)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(null)
            e.currentTarget.blur()
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            setDraft(null)
            onChange(clamp(value + delta))
          }
        }}
      />
    </label>
  )
}

export function TextField({
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft !== value) onChange(draft)
    setDraft(null)
  }
  const props = {
    className: 'input',
    value: draft ?? value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
  }
  return multiline ? (
    <textarea {...props} rows={3} />
  ) : (
    <input {...props} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  )
}

const toHex6 = (c: string) => {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map((ch) => ch + ch).join('')
  return '#000000'
}

export function ColorField({
  value,
  onChange,
  onRemove,
}: {
  value: string
  onChange: (v: string, preview?: boolean) => void
  onRemove?: () => void
}) {
  return (
    <div className="color-field">
      <input
        type="color"
        value={toHex6(value)}
        onChange={(e) => onChange(e.target.value, true)}
        onBlur={() => editor.endPreview()}
      />
      <TextField value={value} onChange={(v) => onChange(v)} />
      {onRemove && (
        <button className="icon-btn" title="Remover" onClick={onRemove}>
          <Minus size={14} />
        </button>
      )}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
