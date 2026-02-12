import { getDiagnoses } from '@lily/api/services/diagnosis/endpoints/get-diagnoses'
import { resolveDiagnosis } from '@lily/api/services/diagnosis/endpoints/resolve-diagnosis'
import { Effect } from 'effect'

export class DiagnosisService extends Effect.Service<DiagnosisService>()(
  'DiagnosisService',
  {
    effect: Effect.succeed({
      getDiagnoses,
      resolveDiagnosis,
    }),
  }
) {}
