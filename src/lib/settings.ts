export const SETTING_ORDER = ['POINT_SOURCE', 'DAC', 'OCEAN_DIC', 'MINERALIZATION', 'BIOLOGICAL'] as const
export const SETTING_LABELS: Record<string, string> = {
  POINT_SOURCE: 'Point source', DAC: 'Direct air capture', OCEAN_DIC: 'Ocean',
  MINERALIZATION: 'Mineralization', BIOLOGICAL: 'Biological',
}
export const SETTING_COLORS: Record<string, string> = {
  POINT_SOURCE: '#93c5fd', DAC: '#5eead4', OCEAN_DIC: '#67e8f9',
  MINERALIZATION: '#fcd34d', BIOLOGICAL: '#a3e635',
}
export const SHORTLIST_STATUSES = ['CANDIDATE', 'UNDER_EVALUATION', 'ELIMINATED', 'CHOSEN'] as const
export const STATUS_LABELS: Record<string, string> = {
  CANDIDATE: 'Candidate', UNDER_EVALUATION: 'Under evaluation', ELIMINATED: 'Eliminated', CHOSEN: 'Chosen',
}
export const ENTRY_KIND_LABELS: Record<string, string> = {
  OBSERVATION: 'Observation', COMPARISON_NOTE: 'Comparison note', DECISION: 'Decision', ELIMINATION: 'Elimination',
}
