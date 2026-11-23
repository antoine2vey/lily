// -*- mode: Bluespec; -*-
// The Live Activity push-to-start guard for one device, in minutes.
// Each action is named after the function it mirrors. Run by
// scripts/check-models.sh. The runs at the end are replayed against the real
// worker and Postgres by live-activity-races.integration.test.ts.
//
// What the model takes for granted, beyond the constants below:
// - Stamps rise in commit order. The code stamps from the JS clock before
//   its UPDATE lands, so two writes a millisecond apart could invert.
// - Two batches race. A redelivered message runs after the attempt it
//   replaces, so a retry is a later run of one of the two.
// - APNs rejects an update token exactly when its card left the device.
// - A PushConfigError behaves like a PushSendError, so Failed stands for both.
// - The device keeps its device token row. Logging out deletes that row and
//   both stamps with it.
module la_start {
  // "none" is 258941ed, "cooldown15" is c474de2e, "unresolved10h" is 0a24dd8a.
  const GUARD: str
  // false reads the row, decides in memory, then stamps: the shape before #82.
  const ATOMIC: bool
  // The guard presumes a card nobody ended is gone when the cooldown lapses.
  // iOS can keep one for 12h: see la_hard_cap_12h.
  const CARD_TTL: int
  // false keeps every registration out of a running batch. A batch runs its
  // reads, claim and send in milliseconds, and a device answers a start in
  // seconds. A relaunched app can still post inside one: see
  // la_confirm_mid_batch.
  const CONFIRM_MID_BATCH: bool
  // The app posts one update token per card. false lands the posts of every
  // card on screen together. One can be lost alone: see la_lost_post.
  const LOST_POSTS: bool

  pure val LA_START_COOLDOWN = 600
  pure val SOFT_TTL = 600
  pure val UNCONFIRMED_TTL = 20160
  pure val CONFIRMED_TTL = 43200

  type Pc = Idle | UpdatePath | StartPath | Claimed
  type Stamp = { minute: int, order: int }
  type Worker = {
    pc: Pc,
    sawActivity: int,
    sawStartToken: bool,
    sawStartSentAt: Stamp,
    sawConfirmedAt: Stamp,
  }
  type Card = { id: int, sentAt: int, confirmed: bool }
  type Send = Delivered | Failed | PushTokenInvalidated
  type UpdateStatus = NoRow | Active | Ended | Expired

  pure val WORKERS = Set("digest", "reminder")
  pure val NONE = -1
  pure val NEVER: Stamp = { minute: -1, order: -1 }

  var now: int
  var startRow: {
    active: bool,
    startedAt: int,
    lastStartSentAt: Stamp,
    lastConfirmedAt: Stamp,
  }
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
    startRow' = {
      active: true, startedAt: 0, lastStartSentAt: NEVER, lastConfirmedAt: NEVER,
    },
    updateRow' = { status: NoRow, activity: NONE, startedAt: NONE },
    cards' = Set(),
    nextCard' = 0,
    writes' = 0,
    workers' = WORKERS.mapBy(_ => {
      pc: Idle, sawActivity: NONE, sawStartToken: false, sawStartSentAt: NEVER,
      sawConfirmedAt: NEVER,
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
    workers' = workers.set(w, {
      pc:
        if (updateRow.status == Active) UpdatePath
        else if (startRow.active) StartPath
        else Idle,
      sawActivity: updateRow.activity,
      sawStartToken: startRow.active,
      sawStartSentAt: startRow.lastStartSentAt,
      sawConfirmedAt: startRow.lastConfirmedAt,
    }),
    now' = now, startRow' = startRow, updateRow' = updateRow, cards' = cards,
    nextCard' = nextCard, writes' = writes,
  }

  // worker.ts stillShowsCard: a failed update counts as a card still shown.
  // An invalidated token ends the row and the batch goes on to the start path.
  action stillShowsCard(w: str, failed: bool): bool = {
    val me = workers.get(w)
    val invalidated = not(failed) and not(cards.exists(c => c.id == me.sawActivity))
    all {
      me.pc == UpdatePath,
      workers' = workers.set(w, {
        ...me,
        pc: if (invalidated and me.sawStartToken) StartPath else Idle,
      }),
      updateRow' =
        if (invalidated and updateRow.activity == me.sawActivity)
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
  // row and keeps its stamps and its started_at.
  action registerStartToken = all {
    not(startRow.active),
    startRow' = { ...startRow, active: true },
    now' = now, updateRow' = updateRow, cards' = cards,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  // register-activity-token.ts registerActivityToken: the app runs with an
  // unlocked keychain and posts a card's update token. The device has one
  // update row, and the upsert keeps the started_at of the row it replaces.
  // A locked phone never gets here.
  action registerActivityToken(card: Card, alone: bool): bool = all {
    cards.contains(card),
    CONFIRM_MID_BATCH or not(midBatch),
    cards' =
      cards.map(c => if (alone and c != card) c else { ...c, confirmed: true }),
    updateRow' = {
      status: Active,
      activity: card.id,
      startedAt: if (updateRow.status == NoRow) now else updateRow.startedAt,
    },
    startRow' = { ...startRow, lastConfirmedAt: stamp },
    writes' = writes + 1,
    now' = now, nextCard' = nextCard, workers' = workers,
  }

  // end-activity.ts endActivity: the app ended a card and told the server.
  action endActivity(card: Card): bool = all {
    cards.contains(card),
    cards' = cards.exclude(Set(card)),
    updateRow' =
      if (updateRow.activity == card.id) { ...updateRow, status: Ended }
      else updateRow,
    now' = now, startRow' = startRow,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  // No server function: the user swipes a card away while the app is not
  // running.
  action swipeAway(card: Card): bool = all {
    cards.contains(card),
    cards' = cards.exclude(Set(card)),
    now' = now, startRow' = startRow, updateRow' = updateRow,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  // live-activity/subscriber.ts refreshLiveActivity, empty backlog: the row
  // ends first, and a lost End push leaves the card on the device.
  action refreshLiveActivity(endDelivered: bool): bool = all {
    updateRow.status == Active,
    updateRow' = { ...updateRow, status: Ended },
    cards' =
      if (endDelivered) cards.filter(c => c.id != updateRow.activity)
      else cards,
    now' = now, startRow' = startRow,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  // activity-scheduler/scheduler.ts expireStaleActivities: the soft TTL.
  action expireStaleActivities = all {
    updateRow.status == Active,
    now - updateRow.startedAt > SOFT_TTL,
    updateRow' = { ...updateRow, status: Expired },
    now' = now, startRow' = startRow, cards' = cards,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  // activity-scheduler/scheduler.ts expireStaleStartTokens.
  action expireStaleStartTokens = all {
    startRow.active,
    if (startRow.lastConfirmedAt == NEVER) now - startRow.startedAt > UNCONFIRMED_TTL
    else now - startRow.lastConfirmedAt.minute > CONFIRMED_TTL,
    startRow' = { ...startRow, active: false },
    now' = now, updateRow' = updateRow, cards' = cards,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  action step = any {
    nondet dt = Set(1, 15, 138, 600, 601, 20161).oneOf()
    advanceTime(dt),
    nondet w = WORKERS.oneOf()
    any {
      findActivities(w),
      nondet failed = Set(true, false).oneOf()
      stillShowsCard(w, failed),
      claimStartTokens(w),
      nondet outcome = Set(Delivered, Failed, PushTokenInvalidated).oneOf()
      sendLiveActivityStart(w, outcome),
    },
    registerStartToken,
    nondet card = cards.oneOf()
    any {
      nondet alone = (if (LOST_POSTS) Set(true, false) else Set(false)).oneOf()
      registerActivityToken(card, alone),
      endActivity(card),
      swipeAway(card),
    },
    nondet endDelivered = Set(true, false).oneOf()
    refreshLiveActivity(endDelivered),
    expireStaleActivities,
    expireStaleStartTokens,
  }

  // The bug in all three incidents: a second card beside one the device
  // never confirmed.
  val noDuplicateCard = cards.filter(c => not(c.confirmed)).size() <= 1

  val oneCardOnScreen = cards.size() <= 1

  action unchanged = all {
    now' = now, startRow' = startRow, updateRow' = updateRow, cards' = cards,
    nextCard' = nextCard, writes' = writes, workers' = workers,
  }

  action deliver(w: str): bool =
    findActivities(w)
      .then(any {
        stillShowsCard(w, false),
        all { workers.get(w).pc != UpdatePath, unchanged },
      })
      .then(any {
        claimStartTokens(w),
        all { workers.get(w).pc != StartPath, unchanged },
      })
      .then(any {
        sendLiveActivityStart(w, Delivered),
        all { workers.get(w).pc != Claimed, unchanged },
      })

  action sweep = any {
    expireStaleActivities,
    all {
      not(updateRow.status == Active and now - updateRow.startedAt > SOFT_TTL),
      unchanged,
    },
  }

  action confirmThenEnd =
    (nondet card = cards.oneOf() registerActivityToken(card, false))
      .then(advanceTime(1))
      .then(nondet card = cards.oneOf() endActivity(card))

  // The 2026-09-11 incident: the overdue digest at 04:42 UTC, a locked phone
  // that never confirms, the regular reminder at 07:00 UTC.
  run digestThenReminder =
    init.then(deliver("digest")).then(advanceTime(138)).then(deliver("reminder"))

  run confirmedThenEnded =
    init.then(deliver("digest")).then(confirmThenEnd).then(deliver("reminder"))

  // A confirmation older than the cooldown must not release a later start
  // the device never confirmed.
  run confirmedLongAgo =
    init
      .then(deliver("digest"))
      .then(confirmThenEnd)
      .then(advanceTime(601))
      .then(deliver("digest"))
      .then(advanceTime(120))
      .then(deliver("reminder"))

  // #367 gap 4: the second activity on a device inherits the first one's
  // started_at, so the soft TTL expires its row at the next sweep.
  run secondActivity =
    init
      .then(deliver("digest"))
      .then(confirmThenEnd)
      .then(advanceTime(601))
      .then(deliver("digest"))
      .then(nondet card = cards.oneOf() registerActivityToken(card, false))
      .then(sweep)
      .then(deliver("reminder"))

  // #367 gap 2: an old card posts again alone, after a newer start that the
  // device never confirmed. Two lost End pushes keep the old card on screen.
  run lostPost =
    init
      .then(deliver("digest"))
      .then(nondet card = cards.oneOf() registerActivityToken(card, false))
      .then(refreshLiveActivity(false))
      .then(deliver("digest"))
      .then(
        nondet old = cards.filter(c => c.id == 0).oneOf()
        registerActivityToken(old, true)
      )
      .then(refreshLiveActivity(false))
      .then(deliver("reminder"))
}

module la_current {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = true, CARD_TTL = 600,
    CONFIRM_MID_BATCH = false, LOST_POSTS = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
  run confirmedThenEndedTest =
    confirmedThenEnded.expect(cards == Set({ id: 1, sentAt: 1, confirmed: false }))
  run confirmedLongAgoTest =
    confirmedLongAgo.expect(cards == Set({ id: 1, sentAt: 602, confirmed: false }))
  run secondActivityTest = secondActivity.expect(not(oneCardOnScreen))
}

module la_no_guard {
  import la_start(
    GUARD = "none", ATOMIC = false, CARD_TTL = 600,
    CONFIRM_MID_BATCH = false, LOST_POSTS = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 2)
}

module la_cooldown15 {
  import la_start(
    GUARD = "cooldown15", ATOMIC = false, CARD_TTL = 600,
    CONFIRM_MID_BATCH = false, LOST_POSTS = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 2)
}

module la_check_then_send {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = false, CARD_TTL = 600,
    CONFIRM_MID_BATCH = false, LOST_POSTS = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
}

module la_hard_cap_12h {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = true, CARD_TTL = 720,
    CONFIRM_MID_BATCH = false, LOST_POSTS = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
}

module la_confirm_mid_batch {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = true, CARD_TTL = 600,
    CONFIRM_MID_BATCH = true, LOST_POSTS = false
  ).*

  run digestThenReminderTest = digestThenReminder.expect(cards.size() == 1)
}

module la_lost_post {
  import la_start(
    GUARD = "unresolved10h", ATOMIC = true, CARD_TTL = 600,
    CONFIRM_MID_BATCH = false, LOST_POSTS = true
  ).*

  run lostPostTest = lostPost.expect(not(noDuplicateCard))
}
