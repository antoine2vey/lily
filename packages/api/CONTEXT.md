# API domain language

The vocabulary of the Lily backend, one section per bounded context. Code, tests, issues and reviews use these terms with these meanings.

A term listed under **Avoid** is a synonym that has meant something different somewhere in the code. Do not use it for the concept.

## Care

Care covers plants, their care schedules, the care history, care plans and the weather adjustment.

### Plant and ownership

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Plant** | One real plant that someone looks after. | |
| **Owner** | Who a plant belongs to: either one user or one canopy, never both, never neither. | "user's plant" when the plant may belong to a canopy |
| **Living plant** | A plant that has not died. Only living plants have due cares, reminders and a health status. | "active plant" |
| **Dead plant** | A plant with a death date, cause and optional note. It sits in its owner's **cemetery**. Its care history stays readable. It has no due cares and gets no reminders. | "archived", "deleted" |
| **Care context** | The timezone and weather location that apply to a plant. It comes from the plant's owner: the user's settings for a user-owned plant, the canopy's settings for a canopy-owned plant. | "user timezone" for a plant-level calculation |

### Time

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Care day** | A calendar day in the plant's care context. All care rules count in care days, not in instants or in UTC days. | "date" for an instant |
| **Today** | The current care day of the plant's care context. Everyone who looks at the plant sees the same today, whatever their own timezone. | "today" meaning the viewer's day, the UTC day, or the last 24 hours |

### Care and schedule

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Care type** | One of watering, fertilization, misting, repotting. | "care log type" as a separate concept |
| **Care** | The fact that someone performed one care type on one plant on one care day. Recorded as a care log. | "task" for something already done |
| **Care history** | All cares of a plant. The source of truth for when the plant was last cared for. | |
| **Care schedule** | The plan for one care type on one plant: its frequency and its next due day. A plant has at most one schedule per care type. | "reminder" for the schedule |
| **Frequency** | The number of care days between two cares of a schedule. At least 1. | |
| **Due day** | The care day on which a schedule's next care should happen. A new schedule's first due day is the day it is created. | "due date" as an instant |
| **Weather adjustment** | A change to the number of days until the next watering, computed from current weather, recent history and forecast at the care context's location. | |
| **Due-day move** | A change of a schedule's due day that no care caused. A care plan sets it to a day, the weather shifts it by whole days, and the end of a vacation pushes later every line that came due while the owner was away. | "reschedule" for a recompute after a care |

### Care status

Every schedule of a living plant has exactly one status, derived from its due day and today.

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Upcoming** | The due day is after today. | |
| **Due today** | The due day is today. | "overdue" for a care due today |
| **Overdue** | The due day is before today. A care becomes overdue on the day after its due day. | "overdue" meaning "the due instant has passed" or "due today or earlier" |

### Rules

1. **One care per day.** A plant has at most one care per care type per care day. A second attempt is rejected on every path. Bulk care skips the plants already cared for today and reports them; it does not fail the batch.
2. **Next due day.** A schedule's next due day is the care day of the latest care of that type plus the frequency. For watering logged for today, the weather adjustment replaces the frequency. Every path that changes the latest care of a type (a new care, an edit, a removal, a correction) recomputes the due day with this rule, and so does a change of frequency. A due-day move stands until then.
3. **No care in the future.** A care's day is today or earlier.
4. **Dead plants are out of care.** Rules 1 and 2, statuses and reminders apply to living plants only. A dead plant accepts no new care, no correction, no schedule change and no due-day move. Its past cares can still be edited or removed.

### Health

- **Condition.** The stored health of a plant: thriving, healthy, sick or recovering. A new plant is healthy. No code changes the condition afterwards yet; which context sets it is open.
- **Needs attention.** Not stored. A living plant in good condition (thriving or healthy) needs attention exactly while one of its cares is overdue. A sick or recovering plant keeps its condition. A dead plant never needs attention.

### Not decided yet

- **Care plan** and **care plan step.** Terms exist in code; their rules have not been reviewed.

## Reminders

Reminders decides which care reminders exist, for whom and when. It plans them from Care's due cares, the plant's audience and each recipient's settings. Delivery sends them and never plans one.

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Reminder** | A notification that tells one user about one plant: a care reminder for a care type that comes due, or the overdue reminder for a plant with an overdue care. | "notification" for the plan, "reminder" for the care schedule |
| **Audience** | The users a plant's reminders are addressed to, before their own settings apply. A personal plant addresses its active caretaker, or its owner when nobody tends it. A canopy plant addresses every member who has not muted it. | "recipients" for the audience |
| **Entitled recipient** | A member of the audience of a living plant with reminders on, whose account is active, who has care reminders on and who is not on vacation. Everyone else is **barred** and loses every reminder that is still waiting. | "subscriber" |
| **Occasion** | The day a reminder is about. For a care reminder it is the due day. For an overdue reminder it is the recipient's own calendar day. | "scheduled date" |
| **Slot** | One recipient, one plant and one care type. A slot holds at most one waiting reminder, for the current occasion. | |
| **Send time** | When a recipient is reminded of an occasion: their preferred time on that day in their own timezone, moved out of their quiet hours. | |
| **Waiting** | A reminder that no delivery worker holds yet. Planning may re-time or remove it. A reminder a worker holds is left alone. | "pending" when queued reminders are meant too |
| **Hand-over** | On a personal plant, a waiting reminder of someone who left the audience passes to whoever tends the plant now, at the time it already had. | "reassign" |
| **No catch-up** | Someone who becomes an entitled recipient after their send time for an occasion gets no reminder for that occasion. A hand-over is not a catch-up: it only moves a reminder that was still waiting. | |
| **Replan** | Making the stored reminders of some plants match the rule. It reads current state, so running it twice changes nothing the second time. | "reschedule", "reconcile" |
| **Request** | What another context sends when it changes something reminders are planned from: the plants, the canopy or the recipient whose reminders are stale. It commits with the change and is replanned after it. | |

### Rules

1. **One writer.** Only Reminders writes, re-times, locks or removes a care or overdue reminder. Delivery moves its status and drops it when it must not be sent.
2. **Ask, do not plan.** A change that makes reminders stale sends a request in its own transaction. A replan that fails does not undo the change. It is retried.
3. **A vacation silences the plant.** A caretaker on vacation is barred and nobody takes their place. The owner is not reminded while the delegation runs.

