import SwiftUI
import WidgetKit

@main
struct LilyWidgetsBundle: WidgetBundle {
  var body: some Widget {
    if #available(iOS 16.2, *) {
      CareTasksLiveActivity()
    }
  }
}
