import ARKit
import ExpoModulesCore
import SceneKit

public class ExpoPlantScannerView: ExpoView, ARSessionDelegate, ARSCNViewDelegate {
  // MARK: - Events

  let onFrameAnalysis = EventDispatcher()
  let onSessionReady = EventDispatcher()
  let onSessionError = EventDispatcher()
  let onPointPlaced = EventDispatcher()
  let onMeasurement = EventDispatcher()
  let onPhotoCaptured = EventDispatcher()

  // MARK: - Subviews

  private var arSCNView: ARSCNView!
  private var coachingOverlay: ARCoachingOverlayView!

  // Embed ARSCNView inside a container VC for proper orientation
  private var containerVC: ARContainerViewController!

  // MARK: - Domain Logic

  private let plantDetector = PlantDetector()
  private let luxAnalyzer = LuxAnalyzer()
  private let potMeasurer = PotMeasurer()

  // MARK: - State

  private var isSessionRunning = false
  private var isMeasureMode = false
  private var isCapturingPhoto = false
  var lastTapId: Double = -1
  var lastResetGeneration: Int = 0
  private var isLiveUpdatePending = false

  private let analysisQueue = DispatchQueue(label: "com.lily.plant-scanner.analysis")
  private var lastAnalysisTime: CFTimeInterval = 0
  private let analysisInterval: CFTimeInterval = 0.3

  private let autoCaptureThreshold = 5
  private var tapGesture: UITapGestureRecognizer!

  // MARK: - Initialization

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    setupARView()
  }

  // MARK: - Setup

  private func setupARView() {
    // Create a container VC that forces portrait — this is critical for ARSCNView orientation
    containerVC = ARContainerViewController()

    arSCNView = containerVC.arView
    arSCNView.automaticallyUpdatesLighting = true
    arSCNView.session.delegate = self
    arSCNView.delegate = self  // SCNSceneRendererDelegate for per-frame updates

    addSubview(containerVC.view)
    containerVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]

    // Coaching overlay
    coachingOverlay = ARCoachingOverlayView()
    coachingOverlay.session = arSCNView.session
    coachingOverlay.goal = .horizontalPlane
    coachingOverlay.activatesAutomatically = true
    coachingOverlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    arSCNView.addSubview(coachingOverlay)

    // Tap gesture
    tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    tapGesture.isEnabled = false
    arSCNView.addGestureRecognizer(tapGesture)
  }

  override public func layoutSubviews() {
    super.layoutSubviews()
    containerVC.view.frame = bounds

    // Attach to parent VC if not already
    if containerVC.parent == nil {
      var responder: UIResponder? = self
      while let next = responder?.next {
        if let vc = next as? UIViewController {
          vc.addChild(containerVC)
          containerVC.didMove(toParent: vc)
          break
        }
        responder = next
      }
    }
  }

  var sceneViewBounds: CGRect {
    arSCNView.bounds
  }

  // MARK: - Props

  func setActive(_ active: Bool) {
    if active && !isSessionRunning {
      startSession()
    } else if !active && isSessionRunning {
      pauseSession()
    }
  }

  func setMeasureMode(_ enabled: Bool) {
    isMeasureMode = enabled
    tapGesture.isEnabled = enabled
  }

  // MARK: - Session Lifecycle

  private func startSession() {
    guard ARWorldTrackingConfiguration.isSupported else {
      onSessionError(["message": "ARKit is not supported on this device."])
      return
    }

    let configuration = ARWorldTrackingConfiguration()
    configuration.planeDetection = [.horizontal, .vertical]
    configuration.environmentTexturing = .automatic

    arSCNView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    isSessionRunning = true
  }

  private func pauseSession() {
    arSCNView.session.pause()
    isSessionRunning = false
  }

  override public func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil {
      pauseSession()
    }
  }

  // MARK: - Photo Capture

  func capturePhoto() {
    guard !isCapturingPhoto,
          let frame = arSCNView.session.currentFrame else { return }

    isCapturingPhoto = true

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let pixelBuffer = frame.capturedImage
      let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
      let context = CIContext()

      guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
        DispatchQueue.main.async { self?.isCapturingPhoto = false }
        return
      }

      let uiImage = UIImage(cgImage: cgImage)
      guard let jpegData = uiImage.jpegData(compressionQuality: 0.8) else {
        DispatchQueue.main.async { self?.isCapturingPhoto = false }
        return
      }

      let tempDir = NSTemporaryDirectory()
      let fileName = "plant-capture-\(UUID().uuidString).jpg"
      let filePath = (tempDir as NSString).appendingPathComponent(fileName)

      do {
        try jpegData.write(to: URL(fileURLWithPath: filePath))
        DispatchQueue.main.async {
          self?.onPhotoCaptured(["path": "file://\(filePath)"])
          self?.isCapturingPhoto = false
        }
      } catch {
        DispatchQueue.main.async { self?.isCapturingPhoto = false }
      }
    }
  }

  // MARK: - Measurement

  func resetMeasurement() {
    potMeasurer.reset(in: arSCNView)
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard isMeasureMode else { return }
    performMeasureTap(at: recognizer.location(in: arSCNView))
  }

  func performMeasureTap(at point: CGPoint) {
    let center = CGPoint(x: arSCNView.bounds.midX, y: arSCNView.bounds.midY)
    guard let result = potMeasurer.handleTap(
      at: center,
      in: arSCNView
    ) else {
      return
    }

    onPointPlaced([
      "index": result.point.index,
      "axis": result.point.axis.rawValue,
      "x": Double(result.point.x),
      "y": Double(result.point.y),
      "z": Double(result.point.z),
    ])

    if let measurement = result.measurement {
      onMeasurement([
        "distanceCm": measurement.distanceCm,
        "axis": measurement.axis.rawValue,
      ])
    }
  }

  // MARK: - ARSCNViewDelegate (per-frame live line tracking)

  public func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
    guard isMeasureMode, potMeasurer.isTrackingLive, !isLiveUpdatePending else { return }

    // Coalesce: skip if a previous dispatch hasn't executed yet
    isLiveUpdatePending = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.isLiveUpdatePending = false
      let center = CGPoint(x: self.arSCNView.bounds.midX, y: self.arSCNView.bounds.midY)
      guard let currentPos = self.potMeasurer.raycast(at: center, in: self.arSCNView) else { return }
      self.potMeasurer.updateLiveTracking(currentPosition: currentPos, in: self.arSCNView)
    }
  }

  // MARK: - ARSessionDelegate

  public func session(_ session: ARSession, didUpdate frame: ARFrame) {
    let now = CACurrentMediaTime()
    guard now - lastAnalysisTime >= analysisInterval else { return }
    lastAnalysisTime = now

    let pixelBuffer = frame.capturedImage

    analysisQueue.async { [weak self] in
      guard let self = self else { return }

      let detection = self.plantDetector.detect(pixelBuffer: pixelBuffer)
      let lux = self.luxAnalyzer.analyze(pixelBuffer: pixelBuffer)

      DispatchQueue.main.async {
        var event: [String: Any] = [
          "plantDetected": detection.plantDetected,
          "detectionStreak": detection.detectionStreak,
          "lux": lux.lux,
          "luxLevel": lux.level,
        ]

        if let bbox = detection.potBbox {
          event["potBbox"] = [
            "x": bbox.x,
            "y": bbox.y,
            "width": bbox.width,
            "height": bbox.height,
          ]
        }
        if let sizeCm = detection.potSizeCm {
          event["potSizeCm"] = sizeCm
        }
        if let category = detection.potSizeCategory {
          event["potSizeCategory"] = category
        }
        if let confidence = detection.potConfidence {
          event["potConfidence"] = confidence
        }

        self.onFrameAnalysis(event)
      }
    }
  }

  public func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
    switch camera.trackingState {
    case .normal:
      onSessionReady([:])
    case .notAvailable:
      onSessionError(["message": "AR tracking is not available."])
    case .limited(let reason):
      switch reason {
      case .excessiveMotion:
        onSessionError(["message": "Too much motion. Please move slower."])
      case .insufficientFeatures:
        onSessionError(["message": "Not enough visual features. Try a more textured surface."])
      case .initializing, .relocalizing:
        break
      @unknown default:
        break
      }
    }
  }

  public func session(_ session: ARSession, didFailWithError error: Error) {
    onSessionError(["message": error.localizedDescription])
  }
}

// MARK: - Container ViewController that forces portrait orientation for ARSCNView

class ARContainerViewController: UIViewController {
  let arView = ARSCNView()

  override func loadView() {
    view = arView
  }

  override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    return .portrait
  }

  override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation {
    return .portrait
  }
}
