import { describe, it, expect } from 'vitest'
import { fromJson, toJson } from '@bufbuild/protobuf'
import { PathwaySchema, Setting } from '@/lib/gen/carbon/v1/pathway_pb'

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
})
