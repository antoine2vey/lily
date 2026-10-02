import SwiftUI

func careEmoji(_ careType: String) -> String {
  switch careType {
  case "watering": return "💧"
  case "fertilization": return "🌿"
  case "misting": return "💦"
  case "repotting": return "🪴"
  default: return "🌱"
  }
}

func careTint(_ careType: String) -> Color {
  switch careType {
  case "watering": return Color(red: 0.30, green: 0.55, blue: 0.85)
  case "fertilization": return Color(red: 0.36, green: 0.55, blue: 0.36)
  case "misting": return Color(red: 0.45, green: 0.65, blue: 0.85)
  case "repotting": return Color(red: 0.65, green: 0.45, blue: 0.30)
  default: return .gray
  }
}

enum LilyPalette {
  static let green = Color(red: 0.36, green: 0.55, blue: 0.36)
  static let greenOnDark = Color(red: 0.49, green: 0.72, blue: 0.48)
  static let coral = Color(red: 0.91, green: 0.60, blue: 0.49)

  static func brand(_ scheme: ColorScheme) -> Color {
    scheme == .dark ? greenOnDark : green
  }
}

func careProgress(completed: Int, pending: Int) -> Double {
  let total = completed + pending
  guard total > 0 else { return 0 }
  return min(1, max(0, Double(completed) / Double(total)))
}
