// This file is duplicated from the main app's local Expo module so the
// widget extension — a separate target that doesn't import Expo — can still
// decode the ActivityAttributes. Keep the two files byte-for-byte identical.
import ActivityKit
import Foundation

@available(iOS 16.2, *)
public struct CareTasksAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public struct Group: Codable, Hashable {
      public let careType: String
      public let count: Int
      public let firstPlantName: String?
      // Localized verb for the badge ("Water" / "Arroser"). Optional for
      // back-compat with pre-v3 payloads — Swift falls back to a
      // capitalized careType.
      public let label: String

      private enum CodingKeys: String, CodingKey {
        case careType, count, firstPlantName, label
      }

      public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        careType = try c.decode(String.self, forKey: .careType)
        count = try c.decode(Int.self, forKey: .count)
        firstPlantName =
          try c.decodeIfPresent(String.self, forKey: .firstPlantName)
        label =
          (try c.decodeIfPresent(String.self, forKey: .label))
          ?? careType.capitalized
      }
    }

    public let schemaVersion: Int
    public let totalPlants: Int
    public let groups: [Group]
    public let headline: String
    public let subheadline: String?
    public let title: String
    public let completedToday: Int
    public let updatedAt: Date

    private enum CodingKeys: String, CodingKey {
      case schemaVersion, totalPlants, groups, headline, subheadline, title,
        completedToday, updatedAt
    }

    // Defensive decoder so older pushes (pre-v3) still render — `title`
    // falls back to a sensible English default, `completedToday` to 0.
    public init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
      totalPlants = try c.decode(Int.self, forKey: .totalPlants)
      groups = try c.decode([Group].self, forKey: .groups)
      headline = try c.decode(String.self, forKey: .headline)
      subheadline = try c.decodeIfPresent(String.self, forKey: .subheadline)
      title =
        (try c.decodeIfPresent(String.self, forKey: .title))
        ?? "Quick care today"
      completedToday =
        try c.decodeIfPresent(Int.self, forKey: .completedToday) ?? 0
      updatedAt = try c.decode(Date.self, forKey: .updatedAt)
    }
  }

  public let userId: String
  public let activityId: String
}
