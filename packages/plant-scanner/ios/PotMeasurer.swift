import ARKit
import SceneKit

/// Which dimension is currently being measured.
enum MeasureAxis: String {
  case width
  case height
}

/// Event data for a placed measurement point.
struct MeasurePointEvent {
  let index: Int
  let axis: MeasureAxis
  let x: Float
  let y: Float
  let z: Float
}

/// Event data for a completed single-axis measurement.
struct MeasurementEvent {
  let distanceCm: Double
  let axis: MeasureAxis
}

/// Holds SceneKit nodes for one measurement axis (2 points + line + label).
private class AxisNodes {
  var points: [simd_float3] = []
  var pointNodes: [SCNNode] = []
  var lineNode: SCNNode?
  var labelNode: SCNNode?
  weak var labelTextNode: SCNNode?
  weak var labelBgNode: SCNNode?
  var distanceCm: Double?

  func reset(in sceneView: ARSCNView) {
    points.removeAll()
    for node in pointNodes {
      node.removeFromParentNode()
    }
    pointNodes.removeAll()
    lineNode?.removeFromParentNode()
    lineNode = nil
    labelNode?.removeFromParentNode()
    labelNode = nil
    labelTextNode = nil
    labelBgNode = nil
    distanceCm = nil
  }
}

/// Handles AR tap-to-measure for pot width (horizontal) and height (vertical).
/// Flow: measure width (2 taps) → auto-transition → measure height (2 taps).
class PotMeasurer {
  private var widthAxis = AxisNodes()
  private var heightAxis = AxisNodes()
  private(set) var currentAxis: MeasureAxis = .width

  private let widthColor = UIColor.white
  private let heightColor = UIColor(red: 0.357, green: 0.549, blue: 0.353, alpha: 1.0) // #5B8C5A

  /// Whether we have exactly 1 point on the current axis and are tracking live
  var isTrackingLive: Bool {
    currentNodes.points.count == 1
  }

  /// Whether both axes are fully measured
  var isComplete: Bool {
    widthAxis.points.count == 2 && heightAxis.points.count == 2
  }

  private var currentNodes: AxisNodes {
    currentAxis == .width ? widthAxis : heightAxis
  }

  private var currentColor: UIColor {
    currentAxis == .width ? widthColor : heightColor
  }

  // MARK: - Raycast

  private static let raycastTargets: [ARRaycastQuery.Target] = [
    .existingPlaneGeometry, .existingPlaneInfinite, .estimatedPlane
  ]

  func raycast(
    at screenPoint: CGPoint,
    in sceneView: ARSCNView
  ) -> simd_float3? {
    for target in Self.raycastTargets {
      if let query = sceneView.raycastQuery(from: screenPoint, allowing: target, alignment: .any),
         let first = sceneView.session.raycast(query).first {
        let col = first.worldTransform.columns.3
        return simd_float3(col.x, col.y, col.z)
      }
    }

    // Fallback: deprecated hitTest (more lenient with feature points)
    guard let hit = sceneView.hitTest(screenPoint, types: [.existingPlane, .featurePoint]).first else {
      return nil
    }
    let col = hit.worldTransform.columns.3
    return simd_float3(col.x, col.y, col.z)
  }

  // MARK: - Tap Handling

  func handleTap(
    at screenPoint: CGPoint,
    in sceneView: ARSCNView
  ) -> (point: MeasurePointEvent, measurement: MeasurementEvent?)? {
    // If both axes are complete, ignore further taps
    guard !isComplete else {
      return nil
    }

    guard let worldPosition = raycast(at: screenPoint, in: sceneView) else {
      return nil
    }

    let nodes = currentNodes
    let axis = currentAxis
    let color = currentColor

    let index = nodes.points.count
    nodes.points.append(worldPosition)

    // Add visual point sphere
    let pointNode = createPointNode(at: worldPosition, color: color)
    sceneView.scene.rootNode.addChildNode(pointNode)
    nodes.pointNodes.append(pointNode)

    let pointEvent = MeasurePointEvent(
      index: index,
      axis: axis,
      x: worldPosition.x,
      y: worldPosition.y,
      z: worldPosition.z
    )

    // If two points on this axis, finalize measurement
    var measurementEvent: MeasurementEvent?
    if nodes.points.count == 2 {
      let roundedCm = computeDistanceCm(nodes: nodes)
      nodes.distanceCm = roundedCm
      updateLine(to: nodes.points[1], nodes: nodes, color: color, in: sceneView)
      updateLabel(text: formatCm(roundedCm), to: nodes.points[1], nodes: nodes, in: sceneView)
      measurementEvent = MeasurementEvent(distanceCm: roundedCm, axis: axis)

      if axis == .width {
        currentAxis = .height
      }
    }

    return (point: pointEvent, measurement: measurementEvent)
  }

  // MARK: - Live Tracking (called every frame from main thread)

  func updateLiveTracking(currentPosition: simd_float3, in sceneView: ARSCNView) {
    guard isTrackingLive else { return }
    let nodes = currentNodes
    let color = currentColor
    updateLine(to: currentPosition, nodes: nodes, color: color, in: sceneView)
    let cm = computeDistanceCm(nodes: nodes, endOverride: currentPosition)
    updateLabel(text: formatCm(cm), to: currentPosition, nodes: nodes, in: sceneView)
  }

  // MARK: - Reset

  func reset(in sceneView: ARSCNView) {
    widthAxis.reset(in: sceneView)
    heightAxis.reset(in: sceneView)
    currentAxis = .width
  }

  // MARK: - Helpers

  private func computeDistanceCm(nodes: AxisNodes, endOverride: simd_float3? = nil) -> Double {
    guard let start = nodes.points.first else { return 0 }
    let end = endOverride ?? (nodes.points.count > 1 ? nodes.points[1] : start)
    let m = Double(simd_distance(start, end))
    return round(m * 1000) / 10  // cm, 1 decimal
  }

  private func formatCm(_ cm: Double) -> String {
    "\(cm) cm"
  }

  // MARK: - Visual: Point

  private func createPointNode(at position: simd_float3, color: UIColor) -> SCNNode {
    let sphere = SCNSphere(radius: 0.004)
    sphere.segmentCount = 12
    let mat = SCNMaterial()
    mat.diffuse.contents = color
    mat.emission.contents = color
    mat.lightingModel = .constant
    sphere.firstMaterial = mat

    let node = SCNNode(geometry: sphere)
    node.simdPosition = position
    node.renderingOrder = 100
    return node
  }

  // MARK: - Visual: Line

  private func orientCylinder(_ node: SCNNode, from start: simd_float3, to end: simd_float3) {
    let direction = simd_normalize(end - start)
    let yAxis = simd_float3(0, 1, 0)

    let dot = simd_dot(yAxis, direction)
    if dot > 0.9999 {
      node.simdOrientation = simd_quatf(ix: 0, iy: 0, iz: 0, r: 1)
    } else if dot < -0.9999 {
      node.simdOrientation = simd_quatf(angle: .pi, axis: simd_float3(0, 0, 1))
    } else {
      node.simdOrientation = simd_quatf(from: yAxis, to: direction)
    }
  }

  private func updateLine(to endPosition: simd_float3, nodes: AxisNodes, color: UIColor, in sceneView: ARSCNView) {
    guard let start = nodes.points.first else { return }
    let dist = simd_distance(start, endPosition)
    guard dist > 0.001 else { return }

    let midpoint = (start + endPosition) / 2

    if let existing = nodes.lineNode, let cylinder = existing.geometry as? SCNCylinder {
      existing.isHidden = false
      cylinder.height = CGFloat(dist)
      existing.simdPosition = midpoint
      orientCylinder(existing, from: start, to: endPosition)
    } else {
      nodes.lineNode?.removeFromParentNode()

      let cylinder = SCNCylinder(radius: 0.001, height: CGFloat(dist))
      let mat = SCNMaterial()
      mat.diffuse.contents = color
      mat.emission.contents = color
      mat.lightingModel = .constant
      cylinder.firstMaterial = mat

      let node = SCNNode(geometry: cylinder)
      node.renderingOrder = 100
      node.simdPosition = midpoint
      orientCylinder(node, from: start, to: endPosition)

      sceneView.scene.rootNode.addChildNode(node)
      nodes.lineNode = node
    }
  }

  // MARK: - Visual: Label

  private func updateLabel(text: String, to endPosition: simd_float3, nodes: AxisNodes, in sceneView: ARSCNView) {
    guard let start = nodes.points.first else { return }
    let midpoint = (start + endPosition) / 2
    let labelPos = midpoint + simd_float3(0, 0.015, 0)

    if let existing = nodes.labelNode {
      existing.isHidden = false
      existing.simdPosition = labelPos

      if let textNode = nodes.labelTextNode,
         let textGeo = textNode.geometry as? SCNText,
         (textGeo.string as? String) != text {
        textGeo.string = text

        let (minB, maxB) = textNode.boundingBox
        let tw = maxB.x - minB.x
        let th = maxB.y - minB.y
        textNode.pivot = SCNMatrix4MakeTranslation(minB.x + tw / 2, minB.y + th / 2, 0)

        if let bgPlane = nodes.labelBgNode?.geometry as? SCNPlane {
          let scale: Float = 0.01 / max(th, 0.001)
          bgPlane.width = CGFloat(tw * scale + 0.012)
        }
      }
      return
    }

    // Create label once
    let textGeo = SCNText(string: text, extrusionDepth: 0)
    textGeo.font = UIFont.systemFont(ofSize: 10, weight: .medium)
    textGeo.alignmentMode = CATextLayerAlignmentMode.center.rawValue
    textGeo.firstMaterial?.diffuse.contents = UIColor.white
    textGeo.firstMaterial?.lightingModel = .constant
    textGeo.flatness = 0.1

    let textNode = SCNNode(geometry: textGeo)
    let (minB, maxB) = textNode.boundingBox
    let tw = maxB.x - minB.x
    let th = maxB.y - minB.y
    textNode.pivot = SCNMatrix4MakeTranslation(minB.x + tw / 2, minB.y + th / 2, 0)

    let desiredH: Float = 0.01
    let sf = desiredH / max(th, 0.001)
    textNode.scale = SCNVector3(sf, sf, sf)

    let bgW = CGFloat(tw * sf + 0.012)
    let bgH = CGFloat(desiredH + 0.012)
    let bgPlane = SCNPlane(width: bgW, height: bgH)
    bgPlane.cornerRadius = bgH / 2
    let bgMat = SCNMaterial()
    bgMat.diffuse.contents = UIColor(red: 0, green: 0, blue: 0, alpha: 0.75)
    bgMat.lightingModel = .constant
    bgPlane.firstMaterial = bgMat

    let bgNode = SCNNode(geometry: bgPlane)
    bgNode.position = SCNVector3(0, 0, -0.001)

    let container = SCNNode()
    container.addChildNode(bgNode)
    container.addChildNode(textNode)
    container.renderingOrder = 200
    container.simdPosition = labelPos

    let billboard = SCNBillboardConstraint()
    billboard.freeAxes = .all
    container.constraints = [billboard]

    sceneView.scene.rootNode.addChildNode(container)
    nodes.labelNode = container
    nodes.labelTextNode = textNode
    nodes.labelBgNode = bgNode
  }
}
