import type { Breakpoint } from '@cms/core'

/** Espaço entre os frames dos breakpoints no canvas, em unidades do documento. */
export const FRAME_GAP = 120

/** Posição x de cada frame no mundo: lado a lado, alinhados no topo, a base em x=0. */
export function frameOffsets(breakpoints: Breakpoint[]): { bp: Breakpoint; x: number }[] {
  let x = 0
  return breakpoints.map((bp) => {
    const frame = { bp, x }
    x += bp.width + FRAME_GAP
    return frame
  })
}
