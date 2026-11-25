// -*- mode: Bluespec; -*-
// The monthly AI-chat quota of one free user: three chat turns race over a
// limit of two while the month can roll over and the process can shut down.
// Each action is named after the step it mirrors in usage-tracker.ts
// (withDetachedReservation), subscription.repository.ts (reserveUsage,
// releaseUsage, chargeUsage), reservation-sweep.ts (sweepUsageReservations),
// stream-chat-message.ts (turnBilling) and chat-turns.ts.
// Run by scripts/check-models.sh. The runs at the end are replayed against
// the real tracker and Postgres by
// usage-reservation-model.integration.test.ts.
//
// What the model takes for granted, beyond the constants below:
// - The user stays on the free tier. The limit is read before the UPDATE, so
//   a downgrade between the two is not modelled.
// - A reply is whole or absent. A stream cut short counts as no reply, and a
//   turn interrupted after its last chunk is refunded like any other.
// - Each transaction is one step. reserveUsage counts the unit and inserts
//   its reservation together, and releaseUsage moves the reservation and
//   gives the unit back together.
// - In usage_current no turn outlives RESERVATION_MAX_AGE, so the sweep only
//   meets a reservation whose turn is over or whose process died.
//   usage_slow_turn drops that.
// - Only shutdown interrupts a detached turn. chat-turns.ts owns the fiber.
// - turn.detach is ChatTurns.fork, which does not fail.
module usage_reservation {
  // "atomic" is reserveUsage: one conditional UPDATE before the work.
  // "checkThenCount" is the shape before #80: read the count, run the model,
  // count afterwards whatever came back.
  // "none" is an endpoint that never reserves, as ai-re-identify before #147.
  const RESERVE: str
  // "chargedRow" is releaseUsage by row id. "currentMonth" is the shape
  // before #158: the row of the user's current period.
  const REFUND_ROW: str
  // "interrupt" is ChatTurns: shutdown interrupts the turn, which refunds.
  // "drop" is the shape before 601e6752: the process exits under a detached
  // fiber that nothing waits for.
  const SHUTDOWN: str
  // true is the shape before #148: a refused send still saved the message.
  const STORE_REFUSED: bool
  // Three ways a turn ends without settling its unit.
  // A SIGKILL, an OOM or a crash ends the process with units still reserved.
  const HARD_KILL: bool
  // refund() and charge() log a SqlError from the repository and move on.
  const RELEASE_FAILS: bool
  // The refund of a fiber that never entered settle runs in a fiber forked
  // with forkDetach, which shutdown does not wait for.
  const LOSES_LATE_REFUND: bool
  // true is reservation-sweep.ts: a reservation left `reserved` is refunded
  // by the next process. false is the shape before #372, where the refund
  // lived only in the fiber of the turn.
  const SWEEP: bool
  // A turn runs longer than RESERVATION_MAX_AGE, so the sweep refunds its
  // unit while it may still reply: see usage_slow_turn.
  const SWEEPS_RUNNING_TURNS: bool

  pure val LIMIT = 2
  pure val TURNS = Set("a", "b", "c")
  pure val MONTHS = Set(0, 1)
  pure val NO_ROW = -1

  type Pc = Idle | Refused | Starting | Forked | Working | Billing | Ended | Dropped
  // The exit of turn.work, as outcomeOf reads it.
  type WorkExit = NoExit | Reply | Empty | ChatStreamError | Timeout | Defect
  type Bill = Saved | SaveFailed | BillDied
  // server.ts: on SIGTERM the HTTP server drains first, then AppLive closes
  // and ChatTurns drains the turns.
  type Phase = Serving | DrainingHttp | DrainingTurns | Killed
  type Turn = {
    pc: Pc,
    requestMonth: int,
    // The usage row this turn took its unit from.
    row: int,
    entered: bool,
    watched: bool,
    exit: WorkExit,
    // The reply was handed out and its unit was not kept.
    givenAway: bool,
    stored: bool,
    refunds: int,
    charges: int,
  }

  var month: int
  // aiChatsCount per period. A period without a row reads as 0, which is
  // what reserveUsage inserts and what a release that matches no row leaves.
  var counts: int -> int
  var turns: str -> Turn
  var phase: Phase

  // The user read a whole reply.
  pure def replied(t: Turn): bool = t.exit == Reply

  // The refund of this turn is left to the fiber that watches `settled`.
  pure def awaitsWatcher(t: Turn): bool =
    t.pc == Ended and not(t.entered) and not(t.watched)

  // The turn has a step of its own still to come in this process.
  pure def running(t: Turn): bool = or {
    t.pc == Starting, t.pc == Forked, t.pc == Working, t.pc == Billing,
    awaitsWatcher(t),
  }

  // The reservation of the turn is still `reserved`.
  pure def open(t: Turn): bool = t.row != NO_ROW and t.refunds + t.charges == 0

  // The turn holds its unit while its settlement is still to come: a step of
  // the turn, or the sweep of a reservation it left open.
  pure def pending(t: Turn): bool = running(t) or (SWEEP and open(t))

  // stream-chat-message.ts turnBilling: replied and repliedUnsaved charge,
  // every other outcome refunds.
  pure def billsCharge(exit: WorkExit): bool = exit == Reply

  // subscription.repository.ts releaseUsage: the reservation leaves
  // `reserved` for `refunded`, and only then
  // SET count = GREATEST(count - 1, 0) WHERE id = its usage row.
  // Before #158: WHERE user_id = userId AND period_start = this month's.
  // Before #372 there was no reservation to move. No turn refunded twice
  // then either, so the condition changes nothing in those shapes.
  def released(t: Turn, lands: bool): int -> int = {
    val target = if (REFUND_ROW == "chargedRow") t.row else month
    if (not(open(t)) or not(lands)) counts
    else counts.set(target, if (counts.get(target) > 0) counts.get(target) - 1 else 0)
  }

  pure def refunded(t: Turn, lands: bool): Turn =
    if (not(open(t)) or not(lands)) t else { ...t, refunds: t.refunds + 1 }

  // subscription.repository.ts chargeUsage: the reservation leaves
  // `reserved` for `charged`. A charge that fails, or that finds the sweep
  // refunded the reservation first, leaves a reply nobody paid for. Before
  // #372 keeping the unit wrote nothing, so it could not fail.
  pure def charged(t: Turn, lands: bool): Turn =
    if (t.row == NO_ROW) t
    else if (open(t) and (lands or not(SWEEP))) { ...t, charges: t.charges + 1 }
    else { ...t, givenAway: true }

  action init = all {
    month' = 0,
    counts' = MONTHS.mapBy(_ => 0),
    turns' = TURNS.mapBy(_ => {
      pc: Idle, requestMonth: NO_ROW, row: NO_ROW, entered: false,
      watched: false, exit: NoExit, givenAway: false, stored: false,
      refunds: 0, charges: 0,
    }),
    phase' = Serving,
  }

  action rollover = all {
    month < 1,
    month' = month + 1,
    counts' = counts, turns' = turns, phase' = phase,
  }

  // usage-tracker.ts reserve -> subscription.repository.ts reserveUsage:
  // UPDATE SET count = count + 1
  // WHERE user_id = userId AND period_start = this month's AND count < limit.
  // No row back is LimitExceededError, and the endpoint answers with the
  // quota message before turn.start, the step that saves the user's message.
  // Before #80 checkAiChatLimit read the count and nothing was written.
  action reserve(t: str): bool = {
    val me = turns.get(t)
    val room = counts.get(month) < LIMIT
    val takes = RESERVE == "atomic" and room
    val refused = RESERVE != "none" and not(room)
    all {
      me.pc == Idle,
      phase == Serving,
      counts' = if (takes) counts.set(month, counts.get(month) + 1) else counts,
      turns' = turns.set(t,
        if (refused) { ...me, pc: Refused, requestMonth: month, stored: STORE_REFUSED }
        else { ...me, pc: Starting, requestMonth: month, row: if (takes) month else NO_ROW }),
      month' = month, phase' = phase,
    }
  }

  // usage-tracker.ts withDetachedReservation:
  // restore(turn.start).pipe(Effect.onError(() => refund(usage, field))),
  // then turn.detach(settle). A start that fails or is interrupted, by a
  // client that left or by the end of the HTTP drain, refunds and forks
  // nothing. withReservation, which meters scans and identifies, is this
  // step alone: acquireUseRelease(reserve, body, refund unless it succeeds).
  action start(t: str, ok: bool, lands: bool): bool = {
    val me = turns.get(t)
    all {
      me.pc == Starting,
      phase == Serving or phase == DrainingHttp,
      lands or RELEASE_FAILS,
      counts' = if (ok) counts else released(me, lands),
      turns' = turns.set(t,
        if (ok) { ...me, pc: Forked, stored: true }
        else { ...refunded(me, lands), pc: Ended, watched: true }),
      month' = month, phase' = phase,
    }
  }

  // The first step of settle: Ref.set(entered, true).
  action enterSettle(t: str): bool = {
    val me = turns.get(t)
    all {
      me.pc == Forked,
      phase != Killed,
      turns' = turns.set(t, { ...me, pc: Working, entered: true }),
      month' = month, counts' = counts, phase' = phase,
    }
  }

  // The FiberSet closes on a fiber before its first step: the fiber ends
  // interrupted and settle never runs.
  action neverEnterSettle(t: str): bool = {
    val me = turns.get(t)
    all {
      me.pc == Forked,
      phase == DrainingTurns,
      SHUTDOWN == "interrupt",
      turns' = turns.set(t, { ...me, pc: Ended }),
      month' = month, counts' = counts, phase' = phase,
    }
  }

  // usage-tracker.ts, the fiber forked after detach:
  // Fiber.await(settled), then refund unless entered was set.
  action watchSettled(t: str, lands: bool): bool = {
    val me = turns.get(t)
    all {
      me.pc == Ended,
      not(me.watched),
      phase != Killed,
      lands or RELEASE_FAILS,
      counts' = if (me.entered) counts else released(me, lands),
      turns' = turns.set(t,
        if (me.entered) { ...me, watched: true }
        else { ...refunded(me, lands), watched: true }),
      month' = month, phase' = phase,
    }
  }

  // settle: Effect.exit(restoreWork(turn.work(started))), not interrupted.
  action work(t: str, exit: WorkExit): bool = {
    val me = turns.get(t)
    all {
      me.pc == Working,
      phase != Killed,
      exit != NoExit,
      turns' = turns.set(t, { ...me, pc: Billing, exit: exit }),
      month' = month, counts' = counts, phase' = phase,
    }
  }

  // settle: Exit.hasInterrupts(exit) refunds without billing, inside the
  // uninterruptible region, so the closing FiberSet waits for the refund.
  // Before 601e6752 nothing owned the fiber and the process left it behind,
  // at any step.
  action interruptWork(t: str, lands: bool): bool = {
    val me = turns.get(t)
    all {
      phase == DrainingTurns,
      lands or RELEASE_FAILS,
      if (SHUTDOWN == "interrupt")
        all {
          me.pc == Working,
          counts' = released(me, lands),
          turns' = turns.set(t, { ...refunded(me, lands), pc: Ended }),
        }
      else
        all {
          me.pc == Forked or me.pc == Working or me.pc == Billing,
          counts' = counts,
          turns' = turns.set(t, { ...me, pc: Dropped }),
        },
      month' = month, phase' = phase,
    }
  }

  // settle, uninterruptible: turn.bill(exit), then charge when it answers
  // 'charge' and refund when it answers 'refund' or dies. A reply bills
  // 'charge' whether or not saving it worked.
  // Before #80 persistChatCompletion ended with trackAiChat, an unconditional
  // increment of this month's row, after a reply, a model error or a timeout.
  action bill(t: str, result: Bill, lands: bool): bool = {
    val me = turns.get(t)
    val keeps = billsCharge(me.exit) and result != BillDied
    all {
      me.pc == Billing,
      phase != Killed,
      lands or RELEASE_FAILS,
      if (RESERVE == "checkThenCount")
        all {
          counts' =
            if (me.exit == Defect) counts
            else counts.set(month, counts.get(month) + 1),
          turns' = turns.set(t,
            if (me.exit == Defect) { ...me, pc: Ended }
            else { ...me, pc: Ended, row: month, charges: 1 }),
        }
      else
        all {
          counts' = if (keeps) counts else released(me, lands),
          turns' = turns.set(t,
            if (keeps) { ...charged(me, lands), pc: Ended }
            else {
              ...refunded(me, lands), pc: Ended,
              givenAway: me.givenAway or result == BillDied,
            }),
        },
      month' = month, phase' = phase,
    }
  }

  // reservation-sweep.ts sweepUsageReservations: releaseUsage on each
  // reservation `reserved` for longer than RESERVATION_MAX_AGE. It runs in
  // any process that is up, also the one that replaced a killed one.
  pure def sweepable(t: Turn): bool =
    SWEEP and open(t) and (SWEEPS_RUNNING_TURNS or not(running(t)))

  action sweep(t: str, lands: bool): bool = {
    val me = turns.get(t)
    all {
      sweepable(me),
      phase != Killed,
      lands or RELEASE_FAILS,
      counts' = released(me, lands),
      turns' = turns.set(t, refunded(me, lands)),
      month' = month, phase' = phase,
    }
  }

  // SIGTERM: the HTTP server stops taking requests and lets the ones in
  // flight finish.
  action shutdown = all {
    phase == Serving,
    phase' = DrainingHttp,
    month' = month, counts' = counts, turns' = turns,
  }

  // chat-turns.ts finalizer: FiberSet.awaitEmpty for SHUTDOWN_DRAIN_DEADLINE,
  // then the set closes and interrupts what is left. No request is left to
  // start a turn by then.
  action closeTurns = all {
    phase == DrainingHttp,
    TURNS.forall(t => turns.get(t).pc != Starting),
    phase' = DrainingTurns,
    month' = month, counts' = counts, turns' = turns,
  }

  // The process exits and the next one serves. The closing FiberSet waited
  // for its fibers. Nothing waits for the fiber that watches `settled`.
  action restart = all {
    phase == DrainingTurns or phase == Killed,
    TURNS.forall(t => {
      val me = turns.get(t)
      phase == Killed or not(running(me)) or (LOSES_LATE_REFUND and awaitsWatcher(me))
    }),
    phase' = Serving,
    turns' = TURNS.mapBy(t => {
      val me = turns.get(t)
      if (awaitsWatcher(me)) { ...me, pc: Dropped } else me
    }),
    month' = month, counts' = counts,
  }

  // SIGKILL, OOM or a crash: every fiber is gone and no finalizer ran.
  action kill = all {
    HARD_KILL,
    phase != Killed,
    phase' = Killed,
    turns' = TURNS.mapBy(t => {
      val me = turns.get(t)
      if (running(me)) { ...me, pc: Dropped } else me
    }),
    month' = month, counts' = counts,
  }

  // The turn, or the sweep of its reservation, has a next step in this
  // process.
  def mayStep(t: Turn): bool =
    if (t.pc == Idle) phase == Serving
    else if (phase == Killed) false
    else if (sweepable(t)) true
    else if (t.pc == Starting) phase == Serving or phase == DrainingHttp
    else running(t) or (t.pc == Ended and not(t.watched))

  // `rare` only weights the sampling: the simulator picks among enabled
  // branches evenly, and a shutdown every other step would leave no two
  // turns in flight together. Every interleaving stays reachable.
  action step = {
    nondet rare = 0.to(7).oneOf()
    any {
      all {
        rare == 0 or TURNS.forall(t => not(mayStep(turns.get(t)))),
        any { rollover, shutdown, closeTurns, kill, restart },
      },
      nondet t = TURNS.filter(name => mayStep(turns.get(name))).oneOf()
      nondet ok = Set(true, false).oneOf()
      nondet lands = Set(true, not(RELEASE_FAILS)).oneOf()
      nondet exit = Set(Reply, Empty, ChatStreamError, Timeout, Defect).oneOf()
      nondet result = Set(Saved, SaveFailed, BillDied).oneOf()
      any {
        reserve(t),
        start(t, ok, lands),
        enterSettle(t),
        neverEnterSettle(t),
        watchSettled(t, lands),
        work(t, exit),
        interruptWork(t, lands),
        bill(t, result, lands),
        sweep(t, lands),
      },
    }
  }

  // Counts by turn name: two turns in the same state are still two turns.
  def turnsWhere(holds: Turn => bool): int =
    TURNS.filter(t => holds(turns.get(t))).size()

  // The plan's promise to the ledger: a month never counts past the limit.
  val neverOverLimit = MONTHS.forall(m => counts.get(m) <= LIMIT)

  // The plan's promise to the business: no month hands out more replies
  // than the limit. A reply is given away on purpose, and not counted here,
  // when its billing died (usage-tracker.ts: "or when `bill` dies"), when
  // its charge failed, or when the sweep refunded it before it was charged.
  val repliesWithinPlan = MONTHS.forall(m =>
    turnsWhere(t => t.requestMonth == m and replied(t) and not(t.givenAway)) <= LIMIT)

  // Every unit a month counts belongs to a turn still running, to a
  // reservation the sweep has yet to refund, or to a reply the user read. A
  // unit left by a turn that failed, timed out or was cut off is a chat the
  // user paid for and never got.
  val noChargeWithoutReply = MONTHS.forall(m =>
    counts.get(m) <= turnsWhere(t => t.row == m and (pending(t) or replied(t))))

  // A month still counts every turn that took a unit from it and was never
  // refunded, so no refund lands on another turn's unit or another month's.
  val noUnitTakenByAnotherRefund = MONTHS.forall(m =>
    counts.get(m) >= turnsWhere(t => t.row == m and t.refunds == 0))

  // A turn that took a unit is charged or refunded once, never both, never
  // twice, and never neither once it is over.
  val settledExactlyOnce = TURNS.forall(name => {
    val t = turns.get(name)
    and {
      t.refunds + t.charges <= 1,
      t.row != NO_ROW and not(pending(t)) implies t.refunds + t.charges == 1,
    }
  })

  // A send over the quota leaves nothing in the conversation.
  val refusedTurnStoresNothing =
    TURNS.forall(t => turns.get(t).pc == Refused implies not(turns.get(t).stored))

  action unchanged = all {
    month' = month, counts' = counts, turns' = turns, phase' = phase,
  }

  action replies(t: str): bool =
    if (turns.get(t).pc == Refused) unchanged
    else start(t, true, true).then(enterSettle(t)).then(work(t, Reply)).then(bill(t, Saved, true))

  // Three sends race for the last two units, then each one that got in
  // reads its reply.
  run parallelOverrun =
    init
      .then(reserve("a")).then(reserve("b")).then(reserve("c"))
      .then(replies("a")).then(replies("b")).then(replies("c"))

  // A turn charged on the last day of a month fails on the first day of the
  // next, after a second turn was charged there.
  run rolloverRefund =
    init
      .then(reserve("a")).then(start("a", true, true)).then(enterSettle("a"))
      .then(rollover)
      .then(reserve("b")).then(start("b", true, true)).then(enterSettle("b"))
      .then(work("a", ChatStreamError)).then(bill("a", Saved, true))
      .then(work("b", Reply)).then(bill("b", Saved, true))

  // An identify metered by withReservation is charged on the last day of a
  // month and fails on the first day of the next.
  run rolloverRefundInRequest =
    init.then(reserve("a")).then(rollover).then(start("a", false, true))

  // A deploy lands while the model is still writing.
  run shutdownMidTurn =
    init
      .then(reserve("a")).then(start("a", true, true)).then(enterSettle("a"))
      .then(shutdown).then(closeTurns)
      .then(interruptWork("a", true))
      .then(restart)

  // The process is killed while the model is still writing.
  run killMidTurn =
    init
      .then(reserve("a")).then(start("a", true, true)).then(enterSettle("a"))
      .then(kill)

  // The model times out and the refund of the turn fails.
  run lostRefund =
    init
      .then(reserve("a")).then(start("a", true, true)).then(enterSettle("a"))
      .then(work("a", Timeout)).then(bill("a", Saved, false))

  // The request finishes its start as the HTTP drain ends, and the FiberSet
  // closes on the forked fiber before its first step.
  run lateFork =
    init
      .then(reserve("a")).then(shutdown).then(start("a", true, true))
      .then(closeTurns).then(neverEnterSettle("a")).then(restart)

  // The sweep refunds a turn that is still writing, and the turn then
  // replies.
  run slowTurn =
    init
      .then(reserve("a")).then(start("a", true, true)).then(enterSettle("a"))
      .then(sweep("a", true))
      .then(work("a", Reply)).then(bill("a", Saved, true))
}

module usage_current {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = true, RELEASE_FAILS = true,
    LOSES_LATE_REFUND = true, SWEEP = true, SWEEPS_RUNNING_TURNS = false
  ).*

  run parallelOverrunTest = parallelOverrun.expect(and {
    counts.get(0) == 2,
    turns.get("c").pc == Refused,
    not(turns.get("c").stored),
  })
  run rolloverRefundTest =
    rolloverRefund.expect(counts.get(0) == 0 and counts.get(1) == 1)
  run rolloverRefundInRequestTest =
    rolloverRefundInRequest.expect(counts.get(0) == 0 and counts.get(1) == 0)
  run shutdownMidTurnTest =
    shutdownMidTurn.expect(counts.get(0) == 0 and turns.get("a").refunds == 1)
}

module usage_check_then_count {
  import usage_reservation(
    RESERVE = "checkThenCount", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = false, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = false, SWEEP = false, SWEEPS_RUNNING_TURNS = false
  ).*

  run parallelOverrunTest = parallelOverrun.expect(counts.get(0) == 3)
}

module usage_refund_current_month {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "currentMonth", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = false, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = false, SWEEP = false, SWEEPS_RUNNING_TURNS = false
  ).*

  run rolloverRefundTest =
    rolloverRefund.expect(counts.get(0) == 1 and counts.get(1) == 0)
  run rolloverRefundInRequestTest =
    rolloverRefundInRequest.expect(counts.get(0) == 1 and counts.get(1) == 0)
}

module usage_shutdown_drops {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "drop",
    STORE_REFUSED = false, HARD_KILL = false, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = false, SWEEP = false, SWEEPS_RUNNING_TURNS = false
  ).*

  run shutdownMidTurnTest =
    shutdownMidTurn.expect(counts.get(0) == 1 and turns.get("a").pc == Dropped)
}

module usage_stores_refused {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = true, HARD_KILL = false, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = false, SWEEP = false, SWEEPS_RUNNING_TURNS = false
  ).*

  run parallelOverrunTest = parallelOverrun.expect(turns.get("c").stored)
}

module usage_unmetered {
  import usage_reservation(
    RESERVE = "none", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = false, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = false, SWEEP = false, SWEEPS_RUNNING_TURNS = false
  ).*

  run parallelOverrunTest = parallelOverrun.expect(and {
    counts.get(0) == 0,
    TURNS.forall(t => turns.get(t).exit == Reply),
  })
}

module usage_hard_kill {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = true, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = false, SWEEP = true, SWEEPS_RUNNING_TURNS = false
  ).*

  run killMidTurnTest =
    killMidTurn
      .expect(counts.get(0) == 1 and turns.get("a").pc == Dropped)
      .then(restart).then(sweep("a", true))
      .expect(counts.get(0) == 0 and turns.get("a").refunds == 1)
}

module usage_release_fails {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = false, RELEASE_FAILS = true,
    LOSES_LATE_REFUND = false, SWEEP = true, SWEEPS_RUNNING_TURNS = false
  ).*

  run lostRefundTest =
    lostRefund
      .expect(counts.get(0) == 1 and turns.get("a").refunds == 0)
      .then(sweep("a", true))
      .expect(counts.get(0) == 0 and turns.get("a").refunds == 1)
}

module usage_late_refund_lost {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = false, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = true, SWEEP = true, SWEEPS_RUNNING_TURNS = false
  ).*

  run lateForkTest =
    lateFork
      .expect(counts.get(0) == 1 and turns.get("a").pc == Dropped)
      .then(sweep("a", true))
      .expect(counts.get(0) == 0 and turns.get("a").refunds == 1)
}

module usage_slow_turn {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = false, RELEASE_FAILS = false,
    LOSES_LATE_REFUND = false, SWEEP = true, SWEEPS_RUNNING_TURNS = true
  ).*

  run slowTurnTest = slowTurn.expect(and {
    counts.get(0) == 0,
    turns.get("a").refunds == 1,
    turns.get("a").charges == 0,
    turns.get("a").givenAway,
  })
}

module usage_no_sweep {
  import usage_reservation(
    RESERVE = "atomic", REFUND_ROW = "chargedRow", SHUTDOWN = "interrupt",
    STORE_REFUSED = false, HARD_KILL = true, RELEASE_FAILS = true,
    LOSES_LATE_REFUND = true, SWEEP = false, SWEEPS_RUNNING_TURNS = false
  ).*

  run killMidTurnTest =
    killMidTurn.then(restart)
      .expect(counts.get(0) == 1 and turns.get("a").pc == Dropped)
  run lostRefundTest =
    lostRefund.expect(counts.get(0) == 1 and turns.get("a").pc == Ended)
  run lateForkTest =
    lateFork.expect(counts.get(0) == 1 and turns.get("a").pc == Dropped)
}
