import ActivityKit
import ExpoModulesCore

// Bridge between JS and ActivityKit for Lily care-task Live Activities.
//
// The activity itself is started by the server via push (iOS 17.2+). This
// module's job is to:
//   1. Surface the per-device push-to-start token so the server can target it.
//   2. Surface each running activity's per-activity update token so the server
//      can push updates.
//   3. Expose `endActivity` for in-app local dismissal.
//
// All user-facing strings live in the `ContentState` sent from the server —
// the widget extension reads them verbatim. Keep the `CareTasksAttributes`
// struct in sync with the shared schema in `@lily/shared/server`.

// No class-level `@available` gate — the module must instantiate on every
// iOS version we support (down to 15.1) so JS can call `isPushToStartSupported`
// and friends without crashing. Individual ActivityKit calls below gate at
// runtime with `if #available`.
public class ExpoLiveActivityLilyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoLiveActivityLilyModule")

    Events("onPushToStartToken", "onActivityToken")

    // iOS 17.2+ can receive push-to-start tokens. Older OS versions can
    // only start activities from the foreground app.
    Function("isPushToStartSupported") { () -> Bool in
      if #available(iOS 17.2, *) { return true }
      return false
    }

    AsyncFunction("requestPushToStartToken") { () -> String? in
      guard #available(iOS 17.2, *) else { return nil }
      // pushToStartToken is a Data? on the Activity type. Subscribing to
      // `pushToStartTokenUpdates` handles rotation — we also emit here so
      // the app can kick off a register call immediately.
      guard let data = Activity<CareTasksAttributes>.pushToStartToken else {
        return nil
      }
      return data.map { String(format: "%02x", $0) }.joined()
    }

    AsyncFunction("listActiveActivities") { () -> [[String: String]] in
      if #available(iOS 16.2, *) {
        return Activity<CareTasksAttributes>.activities.map { activity in
          let token = activity.pushToken?.map { String(format: "%02x", $0) }.joined() ?? ""
          return ["activityId": activity.id, "pushToken": token]
        }
      }
      return []
    }

    AsyncFunction("endActivity") { (activityId: String) in
      if #available(iOS 16.2, *) {
        if let activity = Activity<CareTasksAttributes>.activities.first(where: {
          $0.id == activityId
        }) {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
    }

    OnCreate {
      if #available(iOS 17.2, *) {
        Task { [weak self] in
          for await data in Activity<CareTasksAttributes>.pushToStartTokenUpdates {
            let hex = data.map { String(format: "%02x", $0) }.joined()
            self?.sendEvent("onPushToStartToken", ["token": hex])
          }
        }
      }

      if #available(iOS 16.2, *) {
        // Helper: attach a pushTokenUpdates listener to one activity. Fires
        // the initial token value and every subsequent rotation back to JS.
        func listen(to activity: Activity<CareTasksAttributes>, self: ExpoLiveActivityLilyModule?) {
          Task {
            for await tokenData in activity.pushTokenUpdates {
              let hex = tokenData.map { String(format: "%02x", $0) }.joined()
              self?.sendEvent("onActivityToken", [
                "activityId": activity.id,
                "pushToken": hex,
              ])
            }
          }
        }

        // Cold-start recovery: if iOS started an activity via push while the
        // app was killed, it's already in Activity.activities by the time we
        // init. activityUpdates won't re-emit it, so we iterate the current
        // list explicitly and attach listeners to each existing activity.
        for activity in Activity<CareTasksAttributes>.activities {
          listen(to: activity, self: self)
        }

        // Forward-looking: any activity created after this point (either by
        // the server via a start push while the app IS running, or by the
        // app locally) comes through here.
        Task { [weak self] in
          for await activity in Activity<CareTasksAttributes>.activityUpdates {
            listen(to: activity, self: self)
          }
        }
      }
    }
  }
}
