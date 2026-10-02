import SwiftUI
import WidgetKit

@main
struct LilyWidgetsBundle: WidgetBundle {
  var body: some Widget {
    TodayWidget()
    if #available(iOS 16.2, *) {
      CareTasksLiveActivity()
    }
  }
}
