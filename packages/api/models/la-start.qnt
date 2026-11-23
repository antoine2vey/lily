// -*- mode: Bluespec; -*-
// The Live Activity push-to-start guard for one device, in minutes.
// Each action is named after the function it mirrors. Run by
// scripts/check-models.sh. The runs at the end are replayed against the real
// worker and Postgres by live-activity-races.integration.test.ts.
module la_start {
  // "none" is 258941ed, "cooldown15" is c474de2e, "unresolved10h" is 0a24dd8a.
  const GUARD: str
  // false reads the row, decides in memory, then stamps: the shape before #82.
  const ATOMIC: bool

  pure val LA_START_COOLDOWN = 600
  pure val SOFT_TTL = 600
  // The guard presumes a card nobody ended is gone when the cooldown lapses.
  // iOS can keep one for 12h: see la_hard_cap_12h.
  const CARD_TTL: int
  // false keeps every registration out of a running batch. A batch runs its
  // reads, claim and send in milliseconds, and a device answers a start in
  // seconds. A relaunched app can still post inside one: see la_confirm_mid_batch.
  const CONFIRM_MID_BATCH: bool

  type Pc = Idle | UpdatePath | StartPath | Claimed
  // Stamps are taken to rise in commit order, so order breaks the tie between
  // two of them written inside one model minute.
  type Stamp = { minute: int, order: int }
  type Worker = {
    pc: Pc,
    sawActivity: int,
    sawStartSentAt: Stamp,
    sawConfirmedAt: Stamp,
  }
  type Card = { id: int, sentAt: int, confirmed: bool }
  type Send = Delivered | PushSendError | PushTokenInvalidated
  type UpdateStatus = NoRow | Active | Ended | Expired

  pure val WORKERS = Set("digest", "reminder", "retry")
  pure val NONE = -1
  pure val NEVER: Stamp = { minute: -1, order: -1 }

  var now: int
  var startRow: { active: bool, lastStartSentAt: Stamp, lastConfirmedAt: Stamp }
  var updateRow: { status: UpdateStatus, activity: int, startedAt: int }
  var cards: Set[Card]
  var nextCard: int
  var writes: int
  var workers: str -> Worker

  pure def unresolved(sentAt: Stamp, confirmedAt: Stamp, t: int): bool =
    if (GUARD == "none") false
    else if (GUARD == "cooldown15") sentAt != NEVER and t - sentAt.minute < 15
    else and {
      sentAt != NEVER,
      t - sentAt.minute <= LA_START_COOLDOWN,
      confirmedAt.order < sentAt.order,
    }

  def stamp: Stamp = { minute: now, order: writes }

  def midBatch = WORKERS.exists(w => workers.get(w).pc != Idle)

  action init = all {
    now' = 0,
    startRow' = { active: true, lastStartSentAt: NEVER, lastConfirmedAt: NEVER },
    updateRow' = { status: NoRow, activity: NONE, startedAt: NONE },
    cards' = Set(),
    nextCard' = 0,
    writes' = 0,
    workers' = WORKERS.mapBy(_ => {
      pc: Idle, sawActivity: NONE, sawStartSentAt: NEVER, sawConfirmedAt: NEVER,
    }),
  }

  // A batch ends inside its HTTP timeouts, far under one model minute, so
  // the clock only moves between batches.
  action advanceTime(dt: int): bool = all {
    not(midBatch),
    now' = now + dt,
    cards' = cards.filter(c => now + dt - c.sentAt <= CARD_TTL),
    startRow' = startRow, updateRow' = updateRow,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  // worker.ts sendLiveActivityForCare: the two reads that open a batch.
  action findActivities(w: str): bool = all {
    workers.get(w).pc == Idle,
    startRow.active,
    workers' = workers.set(w, {
      pc: if (updateRow.status == Active) UpdatePath else StartPath,
      sawActivity: updateRow.activity,
      sawStartSentAt: startRow.lastStartSentAt,
      sawConfirmedAt: startRow.lastConfirmedAt,
    }),
    now' = now, startRow' = startRow, updateRow' = updateRow, cards' = cards,
    nextCard' = nextCard, writes' = writes,
  }

  // worker.ts stillShowsCard: APNs invalidates the update token of a card
  // that left the device, and the batch falls through to the start path.
  action stillShowsCard(w: str): bool = {
    val me = workers.get(w)
    val shown = cards.exists(c => c.id == me.sawActivity)
    all {
      me.pc == UpdatePath,
      workers' = workers.set(w, { ...me, pc: if (shown) Idle else StartPath }),
      updateRow' =
        if (not(shown) and updateRow.activity == me.sawActivity)
          { ...updateRow, status: Ended }
        else updateRow,
      now' = now, startRow' = startRow, cards' = cards,
      nextCard' = nextCard, writes' = writes,
    }
  }

  // activity-push-token.repository.ts claimStartTokens: one conditional
  // UPDATE checks the guard and stamps the row.
  action claimStartTokens(w: str): bool = {
    val me = workers.get(w)
    val blocked =
      if (ATOMIC)
        not(startRow.active)
          or unresolved(startRow.lastStartSentAt, startRow.lastConfirmedAt, now)
      else unresolved(me.sawStartSentAt, me.sawConfirmedAt, now)
    all {
      me.pc == StartPath,
      workers' = workers.set(w, { ...me, pc: if (blocked) Idle else Claimed }),
      startRow' =
        if (blocked or GUARD == "none") startRow
        else { ...startRow, lastStartSentAt: stamp },
      writes' = writes + 1,
      now' = now, updateRow' = updateRow, cards' = cards, nextCard' = nextCard,
    }
  }

  // worker.ts sendLiveActivityForCare: the LiveActivityStart send, after the
  // stamp. A failed send keeps the stamp, and a dead token retires the row.
  action sendLiveActivityStart(w: str, outcome: Send): bool = {
    val me = workers.get(w)
    all {
      me.pc == Claimed,
      workers' = workers.set(w, { ...me, pc: Idle }),
      cards' =
        if (outcome == Delivered)
          cards.union(Set({ id: nextCard, sentAt: now, confirmed: false }))
        else cards,
      nextCard' = nextCard + 1, writes' = writes,
      startRow' =
        if (outcome == PushTokenInvalidated) { ...startRow, active: false }
        else startRow,
      now' = now, updateRow' = updateRow,
    }
  }

  // register-start-token.ts registerStartToken: the upsert reactivates the
  // row and keeps its stamps.
  action registerStartToken = all {
    not(startRow.active),
    startRow' = { ...startRow, active: true },
    now' = now, updateRow' = updateRow, cards' = cards,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  // register-activity-token.ts registerActivityToken: the app runs with an
  // unlocked keychain and posts the update token of every card it shows
  // (ExpoLiveActivityLilyModule.swift listens on each one). The device has
  // one update row, so the last post wins. A locked phone never gets here.
  action registerActivityToken(last: Card): bool = all {
    cards.contains(last),
    CONFIRM_MID_BATCH or not(midBatch),
    cards' = cards.map(c => { ...c, confirmed: true }),
    updateRow' = { status: Active, activity: last.id, startedAt: now },
    startRow' = { ...startRow, lastConfirmedAt: stamp },
    writes' = writes + 1,
    now' = now, nextCard' = nextCard, workers' = workers,
  }

  // end-activity.ts endActivity: the app ended a card and told the server.
  action endActivity(card: Card): bool = all {
    cards.contains(card),
    card.confirmed,
    cards' = cards.exclude(Set(card)),
    updateRow' =
      if (updateRow.activity == card.id) { ...updateRow, status: Ended }
      else updateRow,
    now' = now, startRow' = startRow, nextCard' = nextCard, writes' = writes,
    workers' = workers,
  }

  // live-activity/subscriber.ts refreshLiveActivity, empty backlog: the row
  // ends first, and a lost End push leaves the card on the device.
  action refreshLiveActivity(endDelivered: bool): bool = all {
    updateRow.status == Active,
    updateRow' = { ...updateRow, status: Ended },
    cards' =
      if (endDelivered) cards.filter(c => c.id != updateRow.activity)
      else cards,
    now' = now, startRow' = startRow, nextCard' = nextCard, writes' = writes,
    workers' = workers,
  }

  // activity-scheduler/scheduler.ts expireStaleActivities: the soft TTL.
  action expireStaleActivities = all {
    updateRow.status == Active,
    now - updateRow.startedAt > SOFT_TTL,
    updateRow' = { ...updateRow, status: Expired },
    now' = now, startRow' = startRow, cards' = cards,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  action step = any {
    nondet dt = Set(1, 15, 138, 600, 601).oneOf()
    advanceTime(dt),
    nondet w = WORKERS.oneOf()
    any {
      findActivities(w),
      stillShowsCard(w),
      claimStartTokens(w),
      nondet outcome = Set(Delivered, PushSendError, PushTokenInvalidated).oneOf()
      sendLiveActivityStart(w, outcome),
    },
    registerStartToken,
    nondet card = cards.oneOf()
    any { registerActivityToken(card), endActivity(card) },
    nondet endDelivered = Set(true, false).oneOf()
    refreshLiveActivity(endDelivered),
    expireStaleActivities,
  }

  // The bug in all three incidents: a second card beside one the device
  // never confirmed.
  val noDuplicateCard = cards.filter(c => not(c.confirmed)).size() <= 1

  // A confirmed start never holds back the next one, so a card that was
  // confirmed and then ended is replaced by the next batch.
  val confirmedStartNeverBlocks =
    startRow.lastConfirmedAt.order >= startRow.lastStartSentAt.order
      implies not(unresolved(startRow.lastStartSentAt, startRow.lastConfirmedAt, now))

  action deliver(w: str): bool =
    findActivities(w)
      .then(any { stillShowsCard(w), all { workers.get(w).pc != UpdatePath, unchanged } })
      .then(claimStartTokens(w))
      .then(any {
        sendLiveActivityStart(w, Delivered),
        all { workers.get(w).pc != Claimed, unchanged },
      })

  action unchanged = all {
    now' = now, startRow' = startRow, updateRow' = updateRow, cards' = cards,
    nextCard' = nextCard, workers' = workers, writes' = writes,
  }

  // The 2026-09-11 incident: the overdue digest at 04:42 UTC, a locked phone
  // that never confirms, the regular reminder at 07:00 UTC.
  run digestThenReminder =
    init.then(deliver("digest")).then(advanceTime(138)).then(deliver("reminder"))

  run confirmedThenEnded =
    init
      .then(deliver("digest"))
      .then(nondet card = cards.oneOf() registerActivityToken(card))
      .then(advanceTime(1))
      .then(nondet card = cards.oneOf() endActivity(card))
      .then(deliver("reminder"))
}

module la_current {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = true, CARD_TTL = 600, CONFIRM_MID_BATCH = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
  run confirmedThenEndedTest =
    confirmedThenEnded.expect(cards == Set({ id: 1, sentAt: 1, confirmed: false }))
}

module la_no_guard {
  import la_start(
    GUARD = "none", ATOMIC = false, CARD_TTL = 600, CONFIRM_MID_BATCH = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 2)
}

module la_cooldown15 {
  import la_start(
    GUARD = "cooldown15", ATOMIC = false, CARD_TTL = 600, CONFIRM_MID_BATCH = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 2)
}

module la_check_then_send {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = false, CARD_TTL = 600, CONFIRM_MID_BATCH = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
}

module la_hard_cap_12h {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = true, CARD_TTL = 720, CONFIRM_MID_BATCH = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
}

module la_confirm_mid_batch {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = true, CARD_TTL = 600, CONFIRM_MID_BATCH = true
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
}
