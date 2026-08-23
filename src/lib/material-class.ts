import { MaterialClass } from '@/lib/gen/carbon/v1/material_pb'

export const MATERIAL_CLASS_LABELS: Record<string, string> = {
  AMINE_SORBENT: 'Amine sorbent',
  MOF: 'MOF',
  LIQUID_SOLVENT: 'Liquid solvent',
  ENZYME: 'Enzyme',
  ELECTRODE_MATERIAL: 'Electrode material',
  MINERAL: 'Mineral',
  OTHER: 'Other',
}

// filter-chip order follows enum declaration; UNSPECIFIED is not a real class
export const MATERIAL_CLASS_FILTERS = [
  'AMINE_SORBENT',
  'MOF',
  'LIQUID_SOLVENT',
  'ENZYME',
  'ELECTRODE_MATERIAL',
  'MINERAL',
  'OTHER',
] as const

// ?class=MOF → numeric enum value; anything unknown/absent → undefined (no filter)
export const parseMaterialClassFilter = (raw: string | undefined): MaterialClass | undefined => {
  if (!raw) return undefined
  const name = raw.toUpperCase()
  if (!(MATERIAL_CLASS_FILTERS as readonly string[]).includes(name)) return undefined
  return MaterialClass[name as keyof typeof MaterialClass]
}

export const materialClassLabel = (m: { class: number }): string =>
  MATERIAL_CLASS_LABELS[MaterialClass[m.class]] ?? MaterialClass[m.class]
