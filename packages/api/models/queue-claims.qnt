// -*- mode: Bluespec; -*-
// One due notification on its way to a phone: two scheduler polls, the Redis
// queue, two consumers and the recovery sweep. Each action is named after the
// step it mirrors in scheduler.ts (pollAndEnqueue), redis.provider.ts
// (DEQUEUE_SCRIPT, ack, refreshClaim, REQUEUE_STALE_SCRIPT), worker.ts
// (processMessage, retryLater, discardPoisonMessage, consumeNext,
// recoverStrandedDeliveries) and notification.repository.ts.
//
// What the model takes for granted, beyond the constants below:
// - One message carries one row. A care digest carries several, and each
//   UPDATE treats them row by row. That holds only while each step is one
//   statement: the retryLater run of queue-claims-model.integration.test.ts
//   races the sweep against a message of two rows.
// - The dispatch gate sends. A deferred or dropped row leaves the queue
//   through deferUntil or deleteByIds and is never pushed.
// - A push is delivered or every ticket fails. A batch that fails for some
//   devices counts as delivered, as in processMessage.
// - A defect comes before the push, and it need not come back on the
//   redelivery. An entry that cannot be decoded still gives the discard its
//   ids, and its redelivery may decode.
// - Time is three facts: a claim is fresh or stale, a queued row is younger
//   than VISIBILITY_TIMEOUT, older, or older than DELIVERY_TIMEOUT. A retried
//   row is due again at once.
// - The three statements of the sweep run in any order, and a sweep that
//   finds two stale claims is two steps. The code runs them in one order.
// - dispatchNow enqueues a row inserted as queued. That is a poll whose
//   claim and insert are one statement.
// - Redis keeps what it acknowledged, and MULTI and each script are atomic.
module queue_claims {
  // true is claimPendingToSchedule: one UPDATE moves the due row to queued
  // before anything is enqueued. false is the shape before #82: read the
  // pending rows, enqueue, then mark them queued.
  const SCHEDULER_CLAIMS: bool
  // true is claimForDelivery: the worker takes the row for its message
  // before the push. false is the shape before #82: no claim, and the sent
  // mark is unconditional.
  const DELIVERY_CLAIM: bool
  // "token" is a random claim per dequeue. "raw" is the shape before
  // 4db6c557: the entry itself names the claim, so a redelivery shares it.
  const CLAIM_BY: str
  // true is consumeNext's keepClaim: a consumer at work refreshes its claim
  // every minute. false is the shape before 4db6c557.
  const REFRESHES: bool
  // "postgres" is retryLater: one UPDATE on the rows the message holds.
  // "requeueCopy" is the shape before ab6b769b: enqueue a copy with one more
  // retry, and at the last one fail every row the message names.
  const RETRY: str
  // false is the shape before a2f553f7: the third failure commits the rows
  // as failed, then inserts the dead letter.
  const DEAD_LETTER_IN_TX: bool
  // "alertLast" is discardPoisonMessage. "alertFirst" is the shape before
  // 2717607b: alert, claim, fail the rows, then write the dead letter.
  const POISON_ORDER: str
  // The four things today's code leans on, each false in queue_current.
  // A consumer that goes quiet past the visibility timeout and then carries
  // on still holds its row: see queue_quiet_consumer.
  const QUIET_CONSUMER_RESUMES: bool
  // discardUndecodable runs outside keepClaim, so nothing refreshes its
  // claim. true lets that discard outlast the visibility timeout: see
  // queue_slow_discard.
  const DISCARD_OUTLASTS_CLAIM: bool
  // A consumer can stop between sendBatch and the sent mark: a crash, an
  // interrupt past the drain deadline, or a sent mark that failed followed
  // by a failed ack. See queue_lost_after_push.
  const LOSES_AFTER_PUSH: bool
  // A consumer can stop between a dead-letter insert and its ack: a crash,
  // a SqlError from markManyAsFailed, or a failed ack. See
  // queue_lost_after_dead_letter.
  const LOSES_AFTER_DEAD_LETTER: bool

  pure val NONE = -1
  pure val MAX_MESSAGES = 3
  pure val MAX_DELIVERIES = 5
  // RETRY_DELAYS.length: the failure after this many retries is the last.
  pure val LAST_RETRY = 2
  pure val FRESH = 0
  pure val PAST_VISIBILITY = 1
  pure val PAST_DELIVERY = 2
  pure val CONSUMERS = Set("c1", "c2")
  pure val POLLERS = Set("p1", "p2")
  pure val MESSAGES = 0.to(MAX_MESSAGES - 1)
  pure val POISON_STEPS =
    if (POISON_ORDER == "alertLast") List("claim", "store", "fail", "alert")
    else List("alert", "claim", "fail", "store")

  type RowStatus = Pending | Queued | Sent | Failed
  type Row = {
    status: RowStatus,
    deliveryMessageId: int,
    retry: int,
    queuedAtAge: int,
  }
  type Message = { id: int, retry: int }
  type PollPc = Waiting | Holding | Enqueued
  type Pc = Idle | Took | Claimed | Pushed | Failing | AlertDue | Discarding | Done
  type Consumer = {
    pc: Pc,
    delivery: int,
    message: Message,
    claim: int,
    underKeepClaim: bool,
    stage: int,
    discardClaimedRow: bool,
    wroteDeadLetter: bool,
    sentMarkPending: bool,
  }
  type DeliveryState = Held | Requeued | Acked
  type Delivery = { claim: int, state: DeliveryState }

  var row: Row
  var pollers: str -> PollPc
  var consumers: str -> Consumer
  // lily:queue:notifications. LPUSH adds at the head, RPOP takes the last.
  var ready: List[Message]
  // :in-flight and :in-flight:claimed-at. true is a score inside the
  // visibility timeout.
  var inFlight: int -> Message
  var claimedAt: int -> bool
  var nextMessage: int
  // What the phone and the on-call see.
  var pushes: int
  var deadLetters: int -> int
  var alerts: int -> int
  // Not in the code: every dequeue so far.
  var deliveries: List[Delivery]

  pure val IDLE: Consumer = {
    pc: Idle, delivery: NONE, message: { id: NONE, retry: 0 }, claim: NONE,
    underKeepClaim: false, stage: 0, discardClaimedRow: false, wroteDeadLetter: false,
    sentMarkPending: false,
  }

  pure def without(entries: int -> a, key: int): int -> a =
    entries.keys().exclude(Set(key)).mapBy(k => entries.get(k))

  // claimForDelivery: status = 'queued' AND (delivery_message_id IS NULL OR
  // delivery_message_id = messageId).
  def claimable(m: Message): bool =
    row.status == Queued and (row.deliveryMessageId == NONE or row.deliveryMessageId == m.id)

  // The consumer of this claim is at work and will ack inside the
  // visibility timeout: keepClaim refreshes for it, or its discard is short.
  def tended(claim: int): bool = CONSUMERS.exists(c => and {
    consumers.get(c).pc != Idle,
    consumers.get(c).claim == claim,
    consumers.get(c).underKeepClaim or not(DISCARD_OUTLASTS_CLAIM),
  })

  action pollSame = pollers' = pollers
  action queueSame = all {
    ready' = ready, inFlight' = inFlight, claimedAt' = claimedAt,
    deliveries' = deliveries,
  }
  action seenSame = all {
    pushes' = pushes, deadLetters' = deadLetters, alerts' = alerts,
  }

  action initWith(retry: int): bool = all {
    row' = { status: Pending, deliveryMessageId: NONE, retry: retry, queuedAtAge: FRESH },
    pollers' = POLLERS.mapBy(_ => Waiting),
    consumers' = CONSUMERS.mapBy(_ => IDLE),
    ready' = List(), inFlight' = Map(), claimedAt' = Map(),
    nextMessage' = 0,
    pushes' = 0,
    deadLetters' = MESSAGES.mapBy(_ => 0),
    alerts' = MESSAGES.mapBy(_ => 0),
    deliveries' = List(),
  }

  // The row is new, or two pushes already failed for it.
  action init = {
    nondet retry = Set(0, LAST_RETRY).oneOf()
    initWith(retry)
  }

  // scheduler.ts pollAndEnqueue -> claimPendingToSchedule:
  // UPDATE SET status = 'queued', queued_at = now WHERE id IN (SELECT the
  // pending rows that are due FOR UPDATE SKIP LOCKED).
  // Before #82 findPendingToSchedule was that SELECT alone.
  action poll(p: str): bool = all {
    pollers.get(p) == Waiting,
    row.status == Pending,
    pollerMoves(p),
    row' = if (SCHEDULER_CLAIMS) { ...row, status: Queued, queuedAtAge: FRESH } else row,
    pollers' = pollers.set(p, Holding),
    consumers' = consumers, nextMessage' = nextMessage, queueSame, seenSame,
  }

  // pollAndEnqueue: queue.enqueue of a message with a new id, LPUSH. A queue
  // error runs releaseUnclaimed: SET status = 'pending' WHERE status =
  // 'queued' AND delivery_message_id IS NULL.
  action pollEnqueue(p: str, ok: bool): bool = all {
    pollers.get(p) == Holding,
    ready' = if (ok) List({ id: nextMessage, retry: 0 }).concat(ready) else ready,
    nextMessage' = if (ok) nextMessage + 1 else nextMessage,
    row' =
      if (not(ok) and SCHEDULER_CLAIMS and row.status == Queued and row.deliveryMessageId == NONE)
        { ...row, status: Pending, queuedAtAge: FRESH }
      else row,
    pollers' = pollers.set(p, if (ok and not(SCHEDULER_CLAIMS)) Enqueued else Waiting),
    consumers' = consumers,
    inFlight' = inFlight, claimedAt' = claimedAt, deliveries' = deliveries, seenSame,
  }

  // Before #82: markManyAsQueued after the enqueue, WHERE id IN (ids) alone.
  action pollMark(p: str): bool = all {
    pollers.get(p) == Enqueued,
    row' = { ...row, status: Queued, queuedAtAge: FRESH },
    pollers' = pollers.set(p, Waiting),
    consumers' = consumers, nextMessage' = nextMessage, queueSame, seenSame,
  }

  // The process ends between the claim and the enqueue.
  action pollDies(p: str): bool = all {
    pollers.get(p) != Waiting,
    pollers' = pollers.set(p, Waiting),
    row' = row, consumers' = consumers, nextMessage' = nextMessage, queueSame, seenSame,
  }

  // redis.provider.ts DEQUEUE_SCRIPT: RPOP, HSET in-flight claim raw,
  // ZADD claimed-at now claim. The claim is crypto.randomUUID().
  // Before 4db6c557: RPOPLPUSH to :processing and ZADD claimed now raw.
  action dequeue(c: str): bool = {
    val last = ready.length() - 1
    val message = if (last >= 0) ready[last] else IDLE.message
    val claim = if (CLAIM_BY == "token") deliveries.length() else message.id
    all {
      consumers.get(c).pc == Idle,
      ready.length() > 0,
      deliveries.length() < MAX_DELIVERIES,
      ready' = ready.slice(0, last),
      inFlight' = inFlight.put(claim, message),
      claimedAt' = claimedAt.put(claim, true),
      deliveries' = deliveries.append({ claim: claim, state: Held }),
      consumers' = consumers.set(c,
        { ...IDLE, pc: Took, delivery: deliveries.length(), message: message, claim: claim,
          underKeepClaim: true }),
      row' = row, pollSame, nextMessage' = nextMessage, seenSame,
    }
  }

  // worker.ts processMessage -> claimForDelivery(ids, message.id): no row
  // back is "Skipping message - rows already delivered or claimed", and the
  // message is acked. A SqlError goes to retryLater.
  action claimRows(c: str, ok: bool): bool = {
    val me = consumers.get(c)
    val takes = not(DELIVERY_CLAIM) or claimable(me.message)
    all {
      me.pc == Took,
      row' =
        if (ok and DELIVERY_CLAIM and takes) { ...row, deliveryMessageId: me.message.id }
        else row,
      consumers' = consumers.set(c,
        { ...me, pc: if (not(ok)) Failing else if (takes) Claimed else Done }),
      pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // processMessage: pushService.sendBatch. Every ticket failing is a
  // PushSendError.
  action push(c: str, ok: bool): bool = {
    val me = consumers.get(c)
    all {
      me.pc == Claimed,
      pushes' = if (ok) pushes + 1 else pushes,
      consumers' = consumers.set(c,
        if (ok) { ...me, pc: Pushed, sentMarkPending: true } else { ...me, pc: Failing }),
      deadLetters' = deadLetters, alerts' = alerts,
      row' = row, pollSame, nextMessage' = nextMessage, queueSame,
    }
  }

  // completeDelivery -> markManyAsSent: SET status = 'sent' WHERE status =
  // 'queued'. A SqlError is caught there ("Push sent but delivery
  // bookkeeping failed") and the message is acked all the same.
  // Before #82 the UPDATE had no status clause.
  action markSent(c: str, lands: bool): bool = {
    val me = consumers.get(c)
    val writes = lands and (row.status == Queued or not(DELIVERY_CLAIM))
    all {
      me.pc == Pushed,
      row' = if (writes) { ...row, status: Sent } else row,
      consumers' = consumers.set(c, { ...me, pc: Done, sentMarkPending: not(writes) }),
      pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // worker.ts retryLater -> notification.repository.ts retryLater, one
  // UPDATE WHERE status = 'queued' AND delivery_message_id = heldBy: back to
  // pending with one more retry, or failed after RETRY_DELAYS.length. The
  // dead-letter insert shares its transaction, so a failed insert rolls the
  // UPDATE back and the SqlError leaves the message unacked.
  // Before a2f553f7 the UPDATE committed first.
  // Before ab6b769b the worker enqueued a copy with retryCount + 1 and ran
  // incrementRetryCount, and at MAX_RETRIES wrote the dead letter and ran
  // markManyAsFailed(notificationIds).
  action retryLater(c: str, dlOk: bool): bool = {
    val me = consumers.get(c)
    val m = me.message
    val holds = row.status == Queued and row.deliveryMessageId == m.id
    val last = row.retry >= LAST_RETRY
    all {
      me.pc == Failing,
      if (RETRY == "requeueCopy")
        if (m.retry < LAST_RETRY)
          all {
            ready' = List({ id: m.id, retry: m.retry + 1 }).concat(ready),
            row' = { ...row, retry: row.retry + 1 },
            consumers' = consumers.set(c, { ...me, pc: Done }),
            deadLetters' = deadLetters,
          }
        else
          all {
            ready' = ready,
            row' = if (row.status == Queued) { ...row, status: Failed } else row,
            consumers' = consumers.set(c, { ...me, pc: Done, wroteDeadLetter: true }),
            deadLetters' = deadLetters.set(m.id, deadLetters.get(m.id) + 1),
          }
      else
        all {
          ready' = ready,
          if (not(holds))
            all {
              row' = row, deadLetters' = deadLetters,
              consumers' = consumers.set(c, { ...me, pc: Done }),
            }
          else if (not(last))
            all {
              row' = {
                ...row, status: Pending, deliveryMessageId: NONE, retry: row.retry + 1,
                queuedAtAge: FRESH,
              },
              deadLetters' = deadLetters,
              consumers' = consumers.set(c, { ...me, pc: Done }),
            }
          else if (dlOk)
            all {
              row' = { ...row, status: Failed, retry: row.retry + 1 },
              deadLetters' = deadLetters.set(m.id, deadLetters.get(m.id) + 1),
              consumers' = consumers.set(c, { ...me, pc: AlertDue, wroteDeadLetter: true }),
            }
          else
            all {
              row' =
                if (DEAD_LETTER_IN_TX) row
                else { ...row, status: Failed, retry: row.retry + 1 },
              deadLetters' = deadLetters,
              consumers' = consumers.set(c, IDLE),
            },
        },
      pushes' = pushes, alerts' = alerts,
      inFlight' = inFlight, claimedAt' = claimedAt, deliveries' = deliveries,
      pollSame, nextMessage' = nextMessage,
    }
  }

  // worker.ts retryLater, after the commit: alertWarning "Message moved to
  // dead letter queue".
  action alertExhausted(c: str): bool = {
    val me = consumers.get(c)
    all {
      me.pc == AlertDue,
      alerts' = alerts.set(me.message.id, alerts.get(me.message.id) + 1),
      consumers' = consumers.set(c, { ...me, pc: Done }),
      pushes' = pushes, deadLetters' = deadLetters,
      row' = row, pollSame, nextMessage' = nextMessage, queueSame,
    }
  }

  // consumeNext: Effect.catchDefect on processMessage, inside keepClaim.
  action defect(c: str): bool = {
    val me = consumers.get(c)
    all {
      me.pc == Took or me.pc == Claimed,
      consumers' = consumers.set(c, { ...me, pc: Discarding, stage: 0 }),
      row' = row, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // consumeNext: QueueMessageDecodeError on the dequeue goes to
  // discardUndecodable, which keepClaim does not wrap.
  action undecodable(c: str): bool = {
    val me = consumers.get(c)
    all {
      me.pc == Took,
      consumers' = consumers.set(c,
        { ...me, pc: Discarding, stage: 0, underKeepClaim: false }),
      row' = row, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // worker.ts discardPoisonMessage, one statement per step:
  // claimForDelivery, deadLetterRepo.create (with a second try that stores
  // the raw text, so dlOk is false when both fail), markManyAsFailed of the
  // rows it claimed WHERE status = 'queued', alerter.alert. Nothing joins
  // them in a transaction. A SqlError leaves the message unacked.
  action discard(c: str, dlOk: bool): bool = {
    val me = consumers.get(c)
    val m = me.message
    val doing = POISON_STEPS[me.stage]
    val onward =
      if (me.stage + 1 == POISON_STEPS.length()) { ...me, pc: Done }
      else { ...me, stage: me.stage + 1 }
    val takes = DELIVERY_CLAIM and claimable(m)
    val fails = me.discardClaimedRow and row.status == Queued
    all {
      me.pc == Discarding,
      row' =
        if (doing == "claim" and takes) { ...row, deliveryMessageId: m.id }
        else if (doing == "fail" and fails) { ...row, status: Failed }
        else row,
      deadLetters' =
        if (doing == "store" and dlOk) deadLetters.set(m.id, deadLetters.get(m.id) + 1)
        else deadLetters,
      alerts' =
        if (doing == "alert") alerts.set(m.id, alerts.get(m.id) + 1) else alerts,
      consumers' = consumers.set(c,
        if (doing == "claim") { ...onward, discardClaimedRow: takes }
        else if (doing == "store" and dlOk) { ...onward, wroteDeadLetter: true }
        else if (doing == "store") IDLE
        else onward),
      pushes' = pushes, pollSame, nextMessage' = nextMessage, queueSame,
    }
  }

  // consumeNext: queue.ack(claim), HDEL in-flight claim and ZREM claimed-at
  // claim in one MULTI.
  // Before 4db6c557: LREM :processing 1 raw and ZREM claimed raw.
  action ack(c: str): bool = {
    val me = consumers.get(c)
    val own = if (me.pc == Done) deliveries[me.delivery] else { claim: NONE, state: Acked }
    all {
      me.pc == Done,
      inFlight' = inFlight.without(me.claim),
      claimedAt' = claimedAt.without(me.claim),
      deliveries' =
        if (own.state == Held) deliveries.replaceAt(me.delivery, { ...own, state: Acked })
        else deliveries,
      consumers' = consumers.set(c, IDLE),
      ready' = ready, row' = row, pollSame, nextMessage' = nextMessage, seenSame,
    }
  }

  // The consumer stops here and its claim stays behind: a crash, an
  // interrupt past the drain deadline, an error consumeNext lets through to
  // the worker loop, or an ack that failed.
  action abandon(c: str): bool = {
    val me = consumers.get(c)
    all {
      me.pc != Idle,
      me.sentMarkPending implies LOSES_AFTER_PUSH,
      me.wroteDeadLetter implies LOSES_AFTER_DEAD_LETTER,
      consumers' = consumers.set(c, IDLE),
      row' = row, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // consumeNext keepClaim -> refreshClaim: ZADD claimed-at XX now claim.
  action refresh(c: str): bool = {
    val me = consumers.get(c)
    all {
      REFRESHES,
      me.pc != Idle,
      me.underKeepClaim,
      me.claim.in(claimedAt.keys()),
      not(claimedAt.get(me.claim)),
      claimedAt' = claimedAt.set(me.claim, true),
      ready' = ready, inFlight' = inFlight, deliveries' = deliveries,
      consumers' = consumers, row' = row, pollSame, nextMessage' = nextMessage, seenSame,
    }
  }

  // VISIBILITY_TIMEOUT passes with no refresh of this claim.
  action expire(claim: int): bool = all {
    claim.in(claimedAt.keys()),
    claimedAt.get(claim),
    not(REFRESHES) or QUIET_CONSUMER_RESUMES or not(tended(claim)),
    claimedAt' = claimedAt.set(claim, false),
    ready' = ready, inFlight' = inFlight, deliveries' = deliveries,
    consumers' = consumers, row' = row, pollSame, nextMessage' = nextMessage, seenSame,
  }

  // recoverStrandedDeliveries -> requeueStale, REQUEUE_STALE_SCRIPT: for
  // each claim scored at or before the cutoff, RPUSH its entry, HDEL, ZREM.
  action sweepRequeue(claim: int): bool = all {
    claim.in(claimedAt.keys()),
    not(claimedAt.get(claim)),
    ready' = if (claim.in(inFlight.keys())) ready.append(inFlight.get(claim)) else ready,
    inFlight' = inFlight.without(claim),
    claimedAt' = claimedAt.without(claim),
    deliveries' = deliveries.foldl(List(), (swept, d) =>
      swept.append(if (d.claim == claim and d.state == Held) { ...d, state: Requeued } else d)),
    consumers' = consumers, row' = row, pollSame, nextMessage' = nextMessage, seenSame,
  }

  // recoverStrandedDeliveries -> releaseUnclaimedOlderThan: SET status =
  // 'pending' WHERE status = 'queued' AND delivery_message_id IS NULL AND
  // queued_at < now - VISIBILITY_TIMEOUT.
  action sweepRelease = all {
    row.status == Queued,
    row.deliveryMessageId == NONE,
    row.queuedAtAge >= PAST_VISIBILITY,
    row' = { ...row, status: Pending, queuedAtAge: FRESH },
    consumers' = consumers, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
  }

  // recoverStrandedDeliveries -> failAbandonedDeliveries: SET status =
  // 'failed' WHERE status = 'queued' AND (queued_at IS NULL OR
  // (delivery_message_id IS NOT NULL AND queued_at < now - DELIVERY_TIMEOUT)).
  // All three writes of 'queued' set queued_at, so the first disjunct matches
  // no row here.
  action sweepFail = all {
    row.status == Queued,
    row.deliveryMessageId != NONE,
    row.queuedAtAge == PAST_DELIVERY,
    row' = { ...row, status: Failed },
    consumers' = consumers, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
  }

  action rowAges = all {
    row.status == Queued,
    row.queuedAtAge < PAST_DELIVERY,
    row' = { ...row, queuedAtAge: row.queuedAtAge + 1 },
    consumers' = consumers, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
  }

  action unchanged = all {
    row' = row, consumers' = consumers, pollSame, nextMessage' = nextMessage,
    queueSame, seenSame,
  }

  def consumerMoves(c: str): bool = or {
    consumers.get(c).pc != Idle,
    ready.length() > 0 and deliveries.length() < MAX_DELIVERIES,
  }
  def pollerMoves(p: str): bool = or {
    pollers.get(p) != Waiting,
    and {
      row.status == Pending,
      nextMessage + POLLERS.filter(q => pollers.get(q) == Holding).size() < MAX_MESSAGES,
    },
  }
  def claimMoves(claim: int): bool = or {
    not(claimedAt.get(claim)), not(REFRESHES), QUIET_CONSUMER_RESUMES, not(tended(claim)),
  }

  // Each branch draws an actor that has a move, so no draw is wasted, and
  // the last branch idles once nobody has one. `rare` only weights the
  // sampling: the simulator picks among enabled branches evenly, and a fault
  // every other step would leave no delivery running to its end. Every
  // interleaving stays reachable.
  action step = {
    nondet ok = Set(true, false).oneOf()
    nondet rare = 0.to(3).oneOf()
    any {
      nondet p = POLLERS.filter(q => pollerMoves(q)).oneOf()
      any {
        poll(p),
        pollEnqueue(p, true),
        pollMark(p),
        all { rare == 0, any { pollEnqueue(p, false), pollDies(p) } },
      },
      nondet c = CONSUMERS.filter(d => consumerMoves(d)).oneOf()
      any {
        dequeue(c),
        claimRows(c, true),
        push(c, ok),
        markSent(c, true),
        retryLater(c, ok),
        alertExhausted(c),
        discard(c, ok),
        ack(c),
        refresh(c),
        all {
          rare == 0,
          any {
            claimRows(c, false), markSent(c, false), defect(c), undecodable(c), abandon(c),
          },
        },
      },
      nondet claim = claimedAt.keys().filter(k => claimMoves(k)).oneOf()
      any { expire(claim), sweepRequeue(claim) },
      all { rare == 0, any { sweepRelease, sweepFail, rowAges } },
      all {
        CONSUMERS.forall(d => not(consumerMoves(d))),
        POLLERS.forall(q => not(pollerMoves(q))),
        claimedAt.keys().forall(k => not(claimMoves(k))),
        unchanged,
      },
    }
  }

  // A delivery its consumer has not acked is still in Redis under its claim,
  // with a claim time, so the sweep can put it back. One that is gone is
  // lost: nothing redelivers it if its consumer stops.
  val unackedDeliveryStaysInRedis = deliveries.indices().forall(i => {
    val d = deliveries[i]
    d.state == Held implies (d.claim.in(inFlight.keys()) and d.claim.in(claimedAt.keys()))
  })

  // The phone gets the notification once. A retry follows a push that
  // reached no device, so no second delivered push is ever owed.
  val pushedAtMostOnce = pushes <= 1

  val deadLetteredOnce = MESSAGES.forall(m => deadLetters.get(m) <= 1)

  val alertedOnce = MESSAGES.forall(m => alerts.get(m) <= 1)

  // The on-call is told about a message only once its dead letter is there
  // to read.
  val alertOnlyAfterDeadLetter = MESSAGES.forall(m => alerts.get(m) <= deadLetters.get(m))

  // Only failAbandonedDeliveries fails a row with no dead letter, and it
  // waits for DELIVERY_TIMEOUT. A younger failed row carries the id of the
  // message that failed it, and that message has a dead letter. A message
  // that fails a row another one holds leaves the holder's id on it.
  val failedRowHasItsHoldersDeadLetter =
    (row.status == Failed and row.queuedAtAge < PAST_DELIVERY) implies and {
      row.deliveryMessageId != NONE,
      deadLetters.get(row.deliveryMessageId) >= 1,
    }

  // The on-call hears of that row too, once no consumer is still working on
  // the message.
  val failedRowIsReported = and {
    row.status == Failed,
    row.queuedAtAge < PAST_DELIVERY,
    row.deliveryMessageId != NONE,
    CONSUMERS.forall(c => or {
      consumers.get(c).pc == Idle,
      consumers.get(c).message.id != row.deliveryMessageId,
    }),
  } implies (deadLetters.get(row.deliveryMessageId) >= 1 and alerts.get(row.deliveryMessageId) >= 1)

  // A poll that finds nothing due returns without enqueueing.
  action polls(p: str): bool =
    if (row.status == Pending) poll(p) else unchanged
  action enqueues(p: str): bool =
    if (pollers.get(p) == Holding) pollEnqueue(p, true) else unchanged
  action marks(p: str): bool =
    if (pollers.get(p) == Enqueued) pollMark(p) else unchanged
  action sends(c: str): bool =
    if (consumers.get(c).pc == Claimed) push(c, true).then(markSent(c, true)) else unchanged
  action delivers(c: str): bool =
    if (ready.length() == 0) unchanged
    else dequeue(c).then(claimRows(c, true)).then(sends(c)).then(ack(c))
  action discards(c: str, dlOk: bool): bool =
    if (consumers.get(c).pc == Discarding) discard(c, dlOk) else unchanged
  action discardsToTheEnd(c: str, dlOk: bool): bool =
    discards(c, dlOk).then(discards(c, dlOk)).then(discards(c, dlOk)).then(discards(c, dlOk))
  action failsAgain(c: str): bool =
    if (consumers.get(c).pc == Claimed)
      push(c, false).then(retryLater(c, true)).then(alertExhausted(c))
    else unchanged

  // Two polls overlap: the second runs while the first is between its read
  // of the due row and its enqueue.
  run doublePoll =
    initWith(0)
      .then(polls("p1")).then(polls("p2"))
      .then(enqueues("p1")).then(enqueues("p2"))
      .then(marks("p1")).then(marks("p2"))
      .then(delivers("c1")).then(delivers("c2"))

  // The queue is backed up for longer than the visibility timeout: the
  // sweep releases a row whose message is still waiting, the next poll
  // enqueues a second message for it, and two consumers take one each.
  run backlogRelease =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(rowAges).then(sweepRelease)
      .then(polls("p2")).then(enqueues("p2"))
      .then(dequeue("c1")).then(dequeue("c2"))
      .then(claimRows("c1", true)).then(claimRows("c2", true))
      .then(sends("c1")).then(sends("c2"))
      .then(ack("c1")).then(ack("c2"))

  // A consumer stalls on a send past the visibility timeout. The sweep
  // requeues its message, a second consumer takes it, and the first one
  // finishes and acks while the second is still at work.
  run lateAck =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(claimRows("c2", true))
      .then(push("c1", true)).then(markSent("c1", true)).then(ack("c1"))

  // A poison message whose dead letter cannot be written the first time.
  run deadLetterWriteFailsOnce =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(defect("c1")).then(discardsToTheEnd("c1", false))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(defect("c2")).then(discardsToTheEnd("c2", true))
      .then(ack("c2"))

  // The third push failure of a row, whose dead letter cannot be written
  // the first time.
  run thirdFailureDeadLetterFails =
    initWith(LAST_RETRY)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true))
      .then(push("c1", false)).then(retryLater("c1", false))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(claimRows("c2", true)).then(failsAgain("c2"))
      .then(ack("c2"))

  // Two messages name the row, as in backlogRelease. The second holds it.
  // The first cannot read the database on any of its attempts.
  action cannotClaim(c: str): bool =
    if (ready.length() == 0) unchanged
    else dequeue(c).then(claimRows(c, false)).then(retryLater(c, true)).then(ack(c))
  run foreignRow =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(rowAges).then(sweepRelease)
      .then(polls("p2")).then(enqueues("p2"))
      .then(dequeue("c1")).then(dequeue("c2")).then(claimRows("c2", true))
      .then(claimRows("c1", false)).then(retryLater("c1", true)).then(ack("c1"))
      .then(cannotClaim("c1")).then(cannotClaim("c1"))
}

module queue_current {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run doublePollTest = doublePoll.expect(pushes == 1 and row.status == Sent)
  run backlogReleaseTest = backlogRelease.expect(pushes == 1 and row.status == Sent)
  run deadLetterWriteFailsOnceTest = deadLetterWriteFailsOnce.expect(and {
    deadLetters.get(0) == 1, alerts.get(0) == 1, row.status == Failed,
  })
  run thirdFailureDeadLetterFailsTest = thirdFailureDeadLetterFails.expect(and {
    deadLetters.get(0) == 1, alerts.get(0) == 1, row.status == Failed,
  })
  run foreignRowTest = foreignRow.expect(and {
    row.status == Queued, row.deliveryMessageId == 1, deadLetters.get(0) == 0,
  })
}

module queue_before_82 {
  import queue_claims(
    SCHEDULER_CLAIMS = false, DELIVERY_CLAIM = false, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run doublePollTest = doublePoll.expect(pushes == 2)
}

// The poll of before #82 with today's row claim. The claim covers two polls
// that overlap. It does not cover a late markManyAsQueued that puts a sent
// row back to queued under the message that sent it.
module queue_read_then_mark {
  import queue_claims(
    SCHEDULER_CLAIMS = false, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run doublePollTest = doublePoll.expect(pushes == 1)
}

module queue_no_delivery_claim {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = false, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run backlogReleaseTest = backlogRelease.expect(pushes == 2)
}

module queue_raw_claim {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "raw",
    REFRESHES = false, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run lateAckTest = lateAck.expect(and {
    deliveries[1].state == Held,
    consumers.get("c2").pc == Claimed,
    inFlight.keys() == Set(),
  })
}

module queue_retry_requeues_copy {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "requeueCopy", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run foreignRowTest = foreignRow.expect(and {
    not(failedRowHasItsHoldersDeadLetter),
    consumers.get("c2").pc == Claimed,
  })
}

module queue_dead_letter_after_commit {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = false,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run thirdFailureDeadLetterFailsTest = thirdFailureDeadLetterFails.expect(and {
    deadLetters.get(0) == 0, alerts.get(0) == 0, row.status == Failed,
  })
}

module queue_alert_first {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertFirst", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run deadLetterWriteFailsOnceTest =
    deadLetterWriteFailsOnce.expect(alerts.get(0) == 2 and deadLetters.get(0) == 1)
}

module queue_quiet_consumer {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = true, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run lateAckTest = lateAck.expect(and {
    deliveries[1].state == Held,
    inFlight.keys() == Set(1),
    claimedAt.keys() == Set(1),
  })
  run lateAckPushesTwiceTest =
    lateAck.then(push("c2", true)).expect(pushes == 2)
}

module queue_slow_discard {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = true,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false
  ).*

  // The discard of an entry that cannot be decoded stalls after its dead
  // letter. The sweep requeues the entry and a second consumer discards it.
  run slowDiscardTest =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(undecodable("c1"))
      .then(discards("c1", true)).then(discards("c1", true))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(undecodable("c2")).then(discardsToTheEnd("c2", true))
      .then(ack("c2"))
      .then(discardsToTheEnd("c1", true)).then(ack("c1"))
      .expect(deadLetters.get(0) == 2 and alerts.get(0) == 2)
}

module queue_lost_after_push {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = true, LOSES_AFTER_DEAD_LETTER = false
  ).*

  run diesAfterPushTest =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true)).then(push("c1", true))
      .then(abandon("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(delivers("c2"))
      .expect(pushes == 2)
}

module queue_lost_after_dead_letter {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = true
  ).*

  // An entry that cannot be decoded is discarded, and its ack fails.
  run ackFailsAfterDiscardTest =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(defect("c1")).then(discardsToTheEnd("c1", true))
      .then(abandon("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(defect("c2")).then(discardsToTheEnd("c2", true))
      .then(ack("c2"))
      .expect(deadLetters.get(0) == 2 and alerts.get(0) == 2)

  // The process ends between the commit of the third failure and its alert.
  run diesBeforeAlertTest =
    initWith(LAST_RETRY)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true))
      .then(push("c1", false)).then(retryLater("c1", true))
      .then(abandon("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(delivers("c2"))
      .expect(deadLetters.get(0) == 1 and alerts.get(0) == 0 and row.status == Failed)
}
