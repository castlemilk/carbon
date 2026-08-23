import { describe, it, expect } from 'vitest'
import { fromJson, toJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'
import { MaterialSchema, MaterialClass } from '@/lib/gen/carbon/v1/material_pb'
import { JournalEntrySchema } from '@/lib/gen/carbon/v1/research_pb'

describe('protojson round-trip', () => {
  it('parses strict JSON and rejects unknown fields', () => {
    const doc = {
      id: 'x', name: 'X', setting: 'DAC', trl: 5,
      metrics: { cost: { low: 80, high: 600, unit: 'USD/tCO2', year_basis: 2022, source_ref: 's1' } },
    }
    const p = fromJson(PathwaySchema, doc)
    expect(p.setting).toBe(Setting.DAC)
    // snake_case names match the seed-data JSON style (year_basis, source_ref)
    const back = toJson(PathwaySchema, p, { useProtoFieldName: true }) as {
      metrics: { cost: { source_ref: string } }
    }
    expect(back.metrics.cost.source_ref).toBe('s1')
    expect(() => fromJson(PathwaySchema, { ...doc, bogus: true }, { ignoreUnknownFields: false })).toThrow()
  })

  it('round-trips Material with reserved-word class field', () => {
    const doc = {
      id: 'm', name: 'M', class: 'MOF',
      properties: { capacity: { low: 2, high: 4, unit: 'mmol/g', year_basis: 2019, source_ref: 's1' } },
    }
    const m = fromJson(MaterialSchema, doc)
    expect(m.class).toBe(MaterialClass.MOF)
    const back = toJson(MaterialSchema, m, { useProtoFieldName: true }) as {
      properties: { capacity: { low: number } }
    }
    expect(back.properties.capacity.low).toBe(2)
  })

  it('round-trips JournalEntry pathway_refs array', () => {
    const doc = {
      id: 'j1', kind: 'OBSERVATION', title: 'T', body_markdown: 'body',
      pathway_refs: ['p1', 'p2'], created_at: '2026-08-23T00:00:00Z',
    }
    const j = fromJson(JournalEntrySchema, doc)
    expect(j.pathwayRefs).toEqual(['p1', 'p2'])
    const back = toJson(JournalEntrySchema, j, { useProtoFieldName: true }) as {
      pathway_refs: string[]
    }
    expect(back.pathway_refs).toEqual(['p1', 'p2'])
  })
})
