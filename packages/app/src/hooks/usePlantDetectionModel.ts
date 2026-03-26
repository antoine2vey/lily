import { Asset } from 'expo-asset'
import { File, Paths } from 'expo-file-system/next'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import {
  loadTensorflowModel,
  type TensorflowModel,
  type TensorflowPlugin,
} from 'react-native-fast-tflite'

/**
 * COCO class indices relevant to plant detection.
 * EfficientDet-Lite0 is trained on COCO 2017 (80 classes).
 * We detect "potted plant" (63) and "vase" (58) since
 * plants in vases are common and the model sometimes
 * classifies plant containers as vases.
 */
export const PLANT_CLASS_IDS = [58, 63] as const

/**
 * Minimum confidence score (0-1) for a detection to count
 * as a valid plant detection. 0.3 balances sensitivity
 * (catching plants at odd angles/lighting) with precision
 * (avoiding false positives on non-plant objects).
 */
export const DETECTION_CONFIDENCE_THRESHOLD = 0.3

const delegate = Platform.OS === 'ios' ? 'core-ml' : 'android-gpu'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const modelAsset = require('../../assets/models/efficientdet_lite0.tflite')

const MODEL_FILENAME = 'efficientdet_lite0.tflite'

/**
 * Resolves a bundled asset to a local file:// path.
 * Copies from the Metro/bundle cache to documentDirectory
 * so the native TFLite loader can access it directly.
 */
async function getModelPath(): Promise<string> {
  const asset = Asset.fromModule(modelAsset)
  await asset.downloadAsync()

  const destFile = new File(Paths.document, MODEL_FILENAME)

  if (asset.localUri) {
    // Always overwrite to ensure latest model version is used
    if (destFile.exists) destFile.delete()
    console.log(
      `[PlantDetection] Copying model to ${destFile.uri} from ${asset.localUri}`
    )
    const sourceFile = new File(asset.localUri)
    sourceFile.copy(destFile)
  }

  return destFile.uri
}

/**
 * Loads the EfficientDet-Lite0 TFLite model for on-device plant detection.
 *
 * Resolves the bundled model to a local file path via expo-asset + expo-file-system,
 * then loads it with the appropriate GPU delegate (CoreML on iOS,
 * GPU on Android). Falls back to CPU if the delegate fails.
 */
export function usePlantDetectionModel(): TensorflowPlugin {
  const [state, setState] = useState<TensorflowPlugin>({
    model: undefined,
    state: 'loading',
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        console.log('[PlantDetection] Resolving model asset...')
        const modelPath = await getModelPath()
        console.log(`[PlantDetection] Model path: ${modelPath}`)

        if (cancelled) return

        let model: TensorflowModel
        try {
          console.log(
            `[PlantDetection] Loading model with ${delegate} delegate...`
          )
          model = await loadTensorflowModel({ url: modelPath }, delegate)
        } catch (delegateError) {
          console.warn(
            `[PlantDetection] ${delegate} delegate failed, falling back to CPU:`,
            delegateError
          )
          model = await loadTensorflowModel({ url: modelPath }, 'default')
        }

        if (!cancelled) {
          console.log(
            `[PlantDetection] Model loaded (delegate: ${model.delegate})`,
            `inputs: ${JSON.stringify(model.inputs)}`,
            `outputs: ${JSON.stringify(model.outputs)}`
          )
          setState({ model, state: 'loaded' })
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[PlantDetection] Failed to load model:', error)
          setState({
            model: undefined,
            error: error instanceof Error ? error : new Error(String(error)),
            state: 'error',
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
