import {
  type IScanRepository,
  ScanRepository,
} from '@lily/api/repositories/scan.repository'
import type { plantScans } from '@lily/db'
import { Effect, Layer } from 'effect'

type PlantScan = typeof plantScans.$inferSelect

export const createMockScanRepository = (): Layer.Layer<ScanRepository> => {
  const scans: PlantScan[] = []

  const repo: IScanRepository = {
    create: (data) => {
      const newScan: PlantScan = {
        id: `scan-${crypto.randomUUID()}`,
        userId: data.userId,
        scanType: data.scanType,
        createdAt: new Date(),
      }
      scans.push(newScan)
      return Effect.succeed(newScan)
    },
  }

  return Layer.succeed(ScanRepository, repo)
}
