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

## Canopy

Canopy covers the shared household: who is in it, how people get in and out, which plants and rooms it owns, and who has muted which plant. It is the only context that changes the owner of a plant or a room once the row exists.

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Canopy** | A household that owns plants and rooms together. It has a name, a timezone and an optional location, which are the care context of its plants. | "group", "team" |
| **Member** | A user in a canopy. A user is a member of at most one canopy, and a canopy has at most 10 members. | "collaborator" |
| **Canopy owner** | The one member who may change the timezone and location, remove a member and dissolve the canopy. | "owner" alone, which means the owner of a plant |
| **Link** | A join URL. A canopy has at most one live link, and whoever holds it may join until it expires or is revoked. | "invite" for a link |
| **Invitation** | An offer to one account to join one canopy. It is pending, accepted, declined or withdrawn, and a pending one expires 7 days after it was sent. A canopy keeps one invitation per invitee and opens it again when it invites them again. | "invite link" |
| **Share** | A member moves a personal plant of their own into their canopy. **Unshare** moves a canopy plant to the member who asks, as a personal plant. | "transfer" |
| **Sharer** | The user who created the plant. It is recorded once, when the plant is created, and no move changes it. For a canopy plant it is the member who shared it or who created it there. A give-back returns a plant to its sharer and to nobody else. | "creator" when the rule is about who gets the plant back |
| **Ending** | A change that ends a membership or the whole canopy: a member leaves, the canopy owner removes a member, a member's account is deleted, or the canopy is dissolved. | "exit", "cleanup" |
| **Give-back** | The move, at an ending, of the plants a member shared back to that member as personal plants in no room. | "return" for an unshare the member asked for |
| **Heir** | The member who takes what a dissolved canopy still owns after the give-back: its rooms and every plant left, each still in its room. The heir is the canopy owner who dissolves it, or the last member who leaves. | "successor", which is the next canopy owner |
| **Mute** | One member's choice to get no reminder about one plant of their canopy. It ends when the plant or the member leaves the canopy. | "silence", "unsubscribe" |
| **Fact** | What Canopy publishes when a change commits. A fact names what changed. Whoever hears it reads the current state again and does not trust the values it carries. | "event" for an EventBus message |

### Facts

Canopy publishes seven facts on the outbox topic `canopy`, in the transaction of the change.

| Fact | Published when | Reminders replans |
| --- | --- | --- |
| `MemberJoined` | A user joins through a link or an invitation. | The new member as a recipient. |
| `MemberLeft` | A membership ends and the canopy goes on. It says why: left, removed or account deleted. | The former member as a recipient. |
| `PlantsMoved` | Plants change owner: a share, an unshare, a give-back or the heir's part. One fact per receiver. | Those plants. |
| `CanopyTimezoneChanged` | The canopy owner sets a different timezone. | Every plant of the canopy. |
| `PlantMuted` | A member mutes a plant. | That plant. |
| `PlantUnmuted` | A member takes a mute back. | That plant. |
| `CanopyDissolved` | The canopy is gone. It follows the `PlantsMoved` facts of the same change. | Nothing more. The `PlantsMoved` facts said it. |

### Rules

1. **One writer.** Only Canopy writes a canopy, a member, a link, an invitation or a mute, and only Canopy changes the owner of an existing plant or room. Other code reads them and never locks a canopy.
2. **Tell, do not plan.** Canopy never asks Reminders for a replan. It publishes facts, and Reminders decides what they make stale.
3. **Always one canopy owner.** When the canopy owner leaves, the member who joined earliest becomes the canopy owner. The last member who leaves dissolves the canopy and is its heir.
4. **Who may unshare.** The sharer of a canopy plant may unshare it. The canopy owner may once the sharer is no longer a member.
5. **Give-back.** A member who leaves or is removed gets back the plants they shared. When the canopy is dissolved, every member but the heir gets theirs back. A member whose account is deleted leaves their plants in the canopy.
6. **Limits.** A share asks the canopy's plant limit and an unshare asks the member's. A give-back and the heir's part ask no limit.
7. **Invitations.** Any member invites an account that is active and not being deleted. Inviting again while the invitation is open, or within 7 days of the invitee declining, succeeds and sends nothing. The sender or the canopy owner withdraws it, and only the invitee accepts or declines it. An invitation is accepted or declined, never both.
