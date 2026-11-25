// -*- mode: Bluespec; -*-
// One due notification on its way to a phone: two scheduler polls, the Redis
// queue, two consumers and the recovery sweep. Each action is named after the
// step it mirrors in scheduler.ts (pollAndEnqueue), redis.provider.ts
// (DEQUEUE_SCRIPT, ack, refreshClaim, REQUEUE_STALE_SCRIPT), worker.ts
// (processMessage, retryLater, settleEarlierDelivery, alertDeadLetterOnce,
// discardPoisonMessage, consumeNext, recoverStrandedDeliveries),
// notification-delivery.repository.ts and dead-letter.repository.ts.
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
// - A defect comes before the push answers, and it need not come back on the
//   redelivery. An entry that cannot be decoded still gives the discard its
//   ids, and its redelivery may decode. An entry with no readable id is not
//   modelled: each discard of one writes a dead letter and alerts.
// - The alert of a dead letter and the record of it are one step, as the
//   row lock of takeAlert makes them for two consumers. A consumer that
//   stops between the two is LOSES_AFTER_ALERT.
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
  // "dequeue" is claimForDelivery, startPush and retryLater: the row names
  // the claim of the dequeue that holds it. "message" is the shape before
  // the fix of #379: the row names only the message, so a redelivery and
  // the dequeue before it both hold the row.
  const ROW_CLAIM_BY: str
  // true is startPush and settleEarlierDelivery: one UPDATE records that
  // the push begins, no later dequeue takes the row, and a redelivery fails
  // a row whose push was never confirmed. false is the shape before the fix
  // of #379.
  const PUSH_STAMP: bool
  // true is the unique key on a dead letter's message id, the one
  // transaction of discardPoisonMessage, and alertDeadLetterOnce with the
  // alert a redelivery still owes. false is the shape before the fix of
  // #379.
  const DEAD_LETTER_ONCE: bool
  // true is consumeNext racing discardUndecodable against keepClaim. false
  // is the shape before the fix of #379.
  const DISCARD_KEEPS_CLAIM: bool
  // What the world may do to a consumer. Today's code holds its invariants
  // with the first four true, and leans on the fifth being false.
  // A consumer that goes quiet past the visibility timeout and then carries
  // on: see queue_quiet_consumer.
  const QUIET_CONSUMER_RESUMES: bool
  // A discard that keepClaim does not cover can outlast the visibility
  // timeout: see queue_slow_discard.
  const DISCARD_OUTLASTS_CLAIM: bool
  // A consumer can stop between sendBatch and the sent mark: a crash, an
  // interrupt past the drain deadline, or a sent mark that failed followed
  // by a failed ack. See queue_lost_after_push.
  const LOSES_AFTER_PUSH: bool
  // A consumer can stop between a dead-letter insert and its ack: a crash,
  // a SqlError from markManyAsFailed, or a failed ack. See
  // queue_lost_after_dead_letter.
  const LOSES_AFTER_DEAD_LETTER: bool
  // A consumer can stop between an alert and the commit that records it.
  // The redelivery alerts again: see queue_lost_after_alert.
  const LOSES_AFTER_ALERT: bool

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
    if (DEAD_LETTER_ONCE) List("record", "alert")
    else if (POISON_ORDER == "alertLast") List("claim", "store", "fail", "alert")
    else List("alert", "claim", "fail", "store")

  type RowStatus = Pending | Queued | Sent | Failed
  type Row = {
    status: RowStatus,
    deliveryMessageId: int,
    deliveryClaim: int,
    pushStarted: bool,
    // push_started_at, as the number of dequeues before it.
    pushStartedAfter: int,
    retry: int,
    queuedAtAge: int,
  }
  type Message = { id: int, retry: int }
  type PollPc = Waiting | Holding | Enqueued
  type Pc =
    | Idle | Took | Claimed | Sending | Pushed | Failing | Settling | AlertDue
    | Discarding | Done
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
  // dead_letter_messages.alerted_at of the dead letter of each message.
  var alerted: int -> bool
  // Not in the code: every dequeue so far.
  var deliveries: List[Delivery]

  pure val IDLE: Consumer = {
    pc: Idle, delivery: NONE, message: { id: NONE, retry: 0 }, claim: NONE,
    underKeepClaim: false, stage: 0, discardClaimedRow: false, wroteDeadLetter: false,
    sentMarkPending: false,
  }

  pure def without(entries: int -> a, key: int): int -> a =
    entries.keys().exclude(Set(key)).mapBy(k => entries.get(k))

  // claimForDelivery: status = 'queued' AND (push_started_at IS NULL OR
  // delivery_claim = claim) AND (delivery_message_id IS NULL OR
  // delivery_message_id = messageId). Before the fix of #379 no row had
  // push_started_at.
  def claimable(m: Message, claim: int): bool = and {
    row.status == Queued,
    not(row.pushStarted) or row.deliveryClaim == claim,
    row.deliveryMessageId == NONE or row.deliveryMessageId == m.id,
  }

  // startPush and retryLater: status = 'queued' AND delivery_claim = claim.
  // Before the fix of #379 retryLater had delivery_message_id = messageId.
  def holdsRow(me: Consumer): bool = and {
    row.status == Queued,
    if (ROW_CLAIM_BY == "dequeue") row.deliveryClaim == me.claim
    else row.deliveryMessageId == me.message.id,
  }

  // deadLetterRepo.create: ON CONFLICT (original_message_id) DO NOTHING.
  // Before the fix of #379 it was a plain INSERT.
  def withDeadLetter(m: int): int -> int =
    if (DEAD_LETTER_ONCE and deadLetters.get(m) >= 1) deadLetters
    else deadLetters.set(m, deadLetters.get(m) + 1)

  // alertDeadLetterOnce -> takeAlert: UPDATE SET alerted_at = now WHERE
  // original_message_id = messageId AND alerted_at IS NULL, and the alert
  // when it returns a row. Before the fix of #379 the alert was
  // unconditional.
  def alertOwed(m: int): bool =
    not(DEAD_LETTER_ONCE) or (deadLetters.get(m) >= 1 and not(alerted.get(m)))
  def withAlert(m: int): int -> int =
    if (alertOwed(m)) alerts.set(m, alerts.get(m) + 1) else alerts
  def withAlertRecord(m: int): int -> bool =
    if (DEAD_LETTER_ONCE and deadLetters.get(m) >= 1) alerted.set(m, true) else alerted

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
    pushes' = pushes, deadLetters' = deadLetters, alerts' = alerts, alerted' = alerted,
  }

  action initWith(retry: int): bool = all {
    row' = {
      status: Pending, deliveryMessageId: NONE, deliveryClaim: NONE, pushStarted: false, pushStartedAfter: 0,
      retry: retry, queuedAtAge: FRESH,
    },
    pollers' = POLLERS.mapBy(_ => Waiting),
    consumers' = CONSUMERS.mapBy(_ => IDLE),
    ready' = List(), inFlight' = Map(), claimedAt' = Map(),
    nextMessage' = 0,
    pushes' = 0,
    deadLetters' = MESSAGES.mapBy(_ => 0),
    alerts' = MESSAGES.mapBy(_ => 0),
    alerted' = MESSAGES.mapBy(_ => false),
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

  // worker.ts processMessage -> claimForDelivery(ids, { messageId, claim }):
  // no row back is "Skipping message - rows already delivered or claimed",
  // and consumeNext runs settleEarlierDelivery before the ack. A SqlError
  // goes to retryLater. Before the fix of #379 the message was acked at once.
  action claimRows(c: str, ok: bool): bool = {
    val me = consumers.get(c)
    val takes = not(DELIVERY_CLAIM) or claimable(me.message, me.claim)
    val settles = PUSH_STAMP or DEAD_LETTER_ONCE
    all {
      me.pc == Took,
      row' =
        if (ok and DELIVERY_CLAIM and takes)
          {
            ...row, deliveryMessageId: me.message.id,
            deliveryClaim: if (ROW_CLAIM_BY == "dequeue") me.claim else NONE,
          }
        else row,
      consumers' = consumers.set(c, {
        ...me,
        pc:
          if (not(ok)) Failing else if (takes) Claimed
          else if (settles) Settling else Done,
      }),
      pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // processMessage -> startPush: UPDATE SET push_started_at = now WHERE
  // status = 'queued' AND delivery_claim = claim AND push_started_at IS
  // NULL. No row back is "Skipping push - a redelivery took the rows", and
  // consumeNext runs settleEarlierDelivery before the ack.
  action startPush(c: str): bool = {
    val me = consumers.get(c)
    val starts = holdsRow(me) and not(row.pushStarted)
    all {
      PUSH_STAMP,
      me.pc == Claimed,
      row' =
        if (starts) { ...row, pushStarted: true, pushStartedAfter: deliveries.length() }
        else row,
      consumers' = consumers.set(c, { ...me, pc: if (starts) Sending else Settling }),
      pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // processMessage: pushService.sendBatch. Every ticket failing is a
  // PushSendError.
  action push(c: str, ok: bool): bool = {
    val me = consumers.get(c)
    all {
      me.pc == (if (PUSH_STAMP) Sending else Claimed),
      pushes' = if (ok) pushes + 1 else pushes,
      consumers' = consumers.set(c,
        if (ok) { ...me, pc: Pushed, sentMarkPending: true } else { ...me, pc: Failing }),
      deadLetters' = deadLetters, alerts' = alerts, alerted' = alerted,
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

  // worker.ts retryLater -> NotificationDelivery.retryLater, one UPDATE
  // WHERE status = 'queued' AND delivery_claim = heldBy: back to pending
  // with one more retry, or failed after RETRY_DELAYS.length. The
  // dead-letter insert shares its transaction, so a failed insert rolls the
  // UPDATE back and the SqlError leaves the message unacked. A dequeue that
  // holds no row goes on to settleEarlierDelivery.
  // Before a2f553f7 the UPDATE committed first.
  // Before ab6b769b the worker enqueued a copy with retryCount + 1 and ran
  // incrementRetryCount, and at MAX_RETRIES wrote the dead letter and ran
  // markManyAsFailed(notificationIds).
  action retryLater(c: str, dlOk: bool): bool = {
    val me = consumers.get(c)
    val m = me.message
    val holds = holdsRow(me)
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
              consumers' = consumers.set(c,
                { ...me, pc: if (PUSH_STAMP or DEAD_LETTER_ONCE) Settling else Done }),
            }
          else if (not(last))
            all {
              row' = {
                ...row, status: Pending, deliveryMessageId: NONE, deliveryClaim: NONE,
                pushStarted: false, pushStartedAfter: 0, retry: row.retry + 1, queuedAtAge: FRESH,
              },
              deadLetters' = deadLetters,
              consumers' = consumers.set(c, { ...me, pc: Done }),
            }
          else if (dlOk)
            all {
              row' = { ...row, status: Failed, retry: row.retry + 1 },
              deadLetters' = withDeadLetter(m.id),
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
      pushes' = pushes, alerts' = alerts, alerted' = alerted,
      inFlight' = inFlight, claimedAt' = claimedAt, deliveries' = deliveries,
      pollSame, nextMessage' = nextMessage,
    }
  }

  // consumeNext -> settleEarlierDelivery, for a dequeue that holds no row
  // of its message: failUnconfirmed (SET status = 'failed' WHERE status =
  // 'queued' AND delivery_message_id = messageId AND push_started_at < the
  // time of this dequeue) and the dead letter of the rows it failed, in one
  // transaction. A push that started after this dequeue belongs to a later
  // one, which may still be sending. A failed
  // insert rolls the UPDATE back and the SqlError leaves the message
  // unacked. alertDeadLetterOnce follows.
  action settleEarlierDelivery(c: str, dlOk: bool): bool = {
    val me = consumers.get(c)
    val m = me.message
    val unconfirmed = and {
      PUSH_STAMP, row.status == Queued, row.deliveryMessageId == m.id, row.pushStarted,
      row.pushStartedAfter <= me.delivery,
    }
    all {
      me.pc == Settling,
      if (unconfirmed and not(dlOk))
        all {
          row' = row, deadLetters' = deadLetters,
          consumers' = consumers.set(c, IDLE),
        }
      else
        all {
          row' = if (unconfirmed) { ...row, status: Failed } else row,
          deadLetters' = if (unconfirmed) withDeadLetter(m.id) else deadLetters,
          consumers' = consumers.set(c, { ...me, pc: AlertDue, wroteDeadLetter: unconfirmed }),
        },
      pushes' = pushes, alerts' = alerts, alerted' = alerted,
      pollSame, nextMessage' = nextMessage, queueSame,
    }
  }

  // worker.ts alertDeadLetterOnce, after the commit of retryLater or of
  // settleEarlierDelivery: alertWarning "Message moved to dead letter
  // queue" when takeAlert returns the dead letter.
  action alertDeadLetterOnce(c: str): bool = {
    val me = consumers.get(c)
    all {
      me.pc == AlertDue,
      alerts' = withAlert(me.message.id),
      alerted' = withAlertRecord(me.message.id),
      consumers' = consumers.set(c, { ...me, pc: Done }),
      pushes' = pushes, deadLetters' = deadLetters,
      row' = row, pollSame, nextMessage' = nextMessage, queueSame,
    }
  }

  // The consumer stops after its alert went out and before the transaction
  // of alertDeadLetterOnce commits, so alerted_at stays NULL.
  action alertThenStop(c: str): bool = {
    val me = consumers.get(c)
    all {
      LOSES_AFTER_ALERT,
      DEAD_LETTER_ONCE,
      me.pc == AlertDue or (me.pc == Discarding and POISON_STEPS[me.stage] == "alert"),
      alertOwed(me.message.id),
      alerts' = withAlert(me.message.id),
      alerted' = alerted,
      consumers' = consumers.set(c, IDLE),
      pushes' = pushes, deadLetters' = deadLetters,
      row' = row, pollSame, nextMessage' = nextMessage, queueSame,
    }
  }

  // consumeNext: Effect.catchDefect on processMessage, inside keepClaim.
  action defect(c: str): bool = {
    val me = consumers.get(c)
    all {
      me.pc == Took or me.pc == Claimed or me.pc == Sending,
      consumers' = consumers.set(c, { ...me, pc: Discarding, stage: 0 }),
      row' = row, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // consumeNext: QueueMessageDecodeError on the dequeue goes to
  // discardUndecodable, raced against keepClaim. Before the fix of #379
  // keepClaim did not wrap it.
  action undecodable(c: str): bool = {
    val me = consumers.get(c)
    all {
      me.pc == Took,
      consumers' = consumers.set(c,
        { ...me, pc: Discarding, stage: 0, underKeepClaim: DISCARD_KEEPS_CLAIM }),
      row' = row, pollSame, nextMessage' = nextMessage, queueSame, seenSame,
    }
  }

  // worker.ts discardPoisonMessage, two steps. "record" is one transaction:
  // claimForDelivery, deadLetterRepo.create (with a second try that stores
  // the raw text, so dlOk is false when both fail), markManyAsFailed of the
  // rows it claimed. A SqlError rolls it back and leaves the message
  // unacked. "alert" is alertDeadLetterOnce.
  // Before the fix of #379, one statement per step with no transaction:
  // claim, store, fail WHERE status = 'queued', alerter.alert.
  action discard(c: str, dlOk: bool): bool = {
    val me = consumers.get(c)
    val m = me.message
    val doing = POISON_STEPS[me.stage]
    val onward =
      if (me.stage + 1 == POISON_STEPS.length()) { ...me, pc: Done }
      else { ...me, stage: me.stage + 1 }
    val takes = DELIVERY_CLAIM and claimable(m, me.claim)
    val fails = me.discardClaimedRow and row.status == Queued
    val held = {
      ...row, deliveryMessageId: m.id,
      deliveryClaim: if (ROW_CLAIM_BY == "dequeue") me.claim else NONE,
    }
    all {
      me.pc == Discarding,
      row' =
        if (doing == "record" and dlOk and takes) { ...held, status: Failed }
        else if (doing == "claim" and takes) held
        else if (doing == "fail" and fails) { ...row, status: Failed }
        else row,
      deadLetters' =
        if ((doing == "record" or doing == "store") and dlOk) withDeadLetter(m.id)
        else deadLetters,
      alerts' = if (doing == "alert") withAlert(m.id) else alerts,
      alerted' = if (doing == "alert") withAlertRecord(m.id) else alerted,
      consumers' = consumers.set(c,
        if (doing == "claim") { ...onward, discardClaimedRow: takes }
        else if ((doing == "record" or doing == "store") and dlOk)
          { ...onward, wroteDeadLetter: true }
        else if (doing == "record" or doing == "store") IDLE
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
        startPush(c),
        push(c, ok),
        markSent(c, true),
        retryLater(c, ok),
        settleEarlierDelivery(c, ok),
        alertDeadLetterOnce(c),
        discard(c, ok),
        ack(c),
        refresh(c),
        all {
          rare == 0,
          any {
            claimRows(c, false), markSent(c, false), defect(c), undecodable(c), abandon(c),
            alertThenStop(c),
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
  // to read. An alert that repeats still has that dead letter.
  val alertOnlyAfterDeadLetter =
    MESSAGES.forall(m => alerts.get(m) >= 1 implies deadLetters.get(m) >= 1)

  // Only failAbandonedDeliveries fails a row with no dead letter, and it
  // waits for DELIVERY_TIMEOUT. A younger failed row carries the id of the
  // message that failed it, and that message has a dead letter. A message
  // that fails a row another one holds leaves the holder's id on it.
  val failedRowHasItsHoldersDeadLetter =
    (row.status == Failed and row.queuedAtAge < PAST_DELIVERY) implies and {
      row.deliveryMessageId != NONE,
      deadLetters.get(row.deliveryMessageId) >= 1,
    }

  def inRedis(m: int): bool = or {
    ready.indices().exists(i => ready[i].id == m),
    inFlight.keys().exists(claim => inFlight.get(claim).id == m),
  }

  // The on-call hears of that row too, once no consumer is still working on
  // the message and Redis holds no copy of it for a redelivery to alert.
  val failedRowIsReported = and {
    row.status == Failed,
    row.queuedAtAge < PAST_DELIVERY,
    row.deliveryMessageId != NONE,
    not(inRedis(row.deliveryMessageId)),
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
  action starts(c: str): bool =
    if (PUSH_STAMP and consumers.get(c).pc == Claimed) startPush(c) else unchanged
  action sendsBatch(c: str, ok: bool): bool =
    if (consumers.get(c).pc == (if (PUSH_STAMP) Sending else Claimed)) push(c, ok)
    else unchanged
  action marksSent(c: str): bool =
    if (consumers.get(c).pc == Pushed) markSent(c, true) else unchanged
  action sends(c: str): bool =
    starts(c).then(sendsBatch(c, true)).then(marksSent(c))
      .then(settles(c)).then(alertsIfDue(c))
  action settles(c: str): bool =
    if (consumers.get(c).pc == Settling) settleEarlierDelivery(c, true) else unchanged
  action alertsIfDue(c: str): bool =
    if (consumers.get(c).pc == AlertDue) alertDeadLetterOnce(c) else unchanged
  action retries(c: str): bool =
    if (consumers.get(c).pc == Failing) retryLater(c, true) else unchanged
  action acks(c: str): bool =
    if (consumers.get(c).pc == Done) ack(c) else unchanged
  action delivers(c: str): bool =
    if (ready.length() == 0) unchanged
    else
      dequeue(c).then(claimRows(c, true)).then(sends(c))
        .then(settles(c)).then(alertsIfDue(c)).then(ack(c))
  action discards(c: str, dlOk: bool): bool =
    if (consumers.get(c).pc == Discarding) discard(c, dlOk) else unchanged
  action discardsToTheEnd(c: str, dlOk: bool): bool =
    discards(c, dlOk).then(discards(c, dlOk)).then(discards(c, dlOk)).then(discards(c, dlOk))
  action failsAgain(c: str): bool =
    starts(c).then(sendsBatch(c, false)).then(retries(c))
      .then(settles(c)).then(alertsIfDue(c))

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
      .then(settles("c2")).then(alertsIfDue("c2"))
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
      .then(sends("c1")).then(ack("c1"))

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
      .then(starts("c1")).then(sendsBatch("c1", false)).then(retryLater("c1", false))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(claimRows("c2", true)).then(failsAgain("c2"))
      .then(ack("c2"))

  // Two messages name the row, as in backlogRelease. The second holds it.
  // The first cannot read the database on any of its attempts.
  action cannotClaim(c: str): bool =
    if (ready.length() == 0) unchanged
    else
      dequeue(c).then(claimRows(c, false)).then(retryLater(c, true))
        .then(settles(c)).then(alertsIfDue(c)).then(ack(c))

  // A consumer goes quiet past the visibility timeout before it starts its
  // push. Its redelivery takes the row and pushes, then the first resumes.
  run quietBeforeThePush =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true))
      .then(expire(0)).then(sweepRequeue(0))
      .then(delivers("c2"))
      .then(sends("c1")).then(ack("c1"))

  // The same consumer goes quiet inside sendBatch.
  run quietAtTheSend =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true)).then(starts("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(delivers("c2"))
      .then(sends("c1")).then(ack("c1"))

  // A consumer goes quiet before its claim, and cannot read the database
  // when it resumes, behind the redelivery that is sending. Then the next
  // poll and a delivery of what it finds.
  run quietThenFails =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(claimRows("c2", true)).then(starts("c2"))
      .then(claimRows("c1", false)).then(retryLater("c1", true))
      .then(settles("c1")).then(alertsIfDue("c1")).then(ack("c1"))
      .then(sendsBatch("c2", true)).then(marksSent("c2")).then(ack("c2"))
      .then(polls("p2")).then(enqueues("p2")).then(delivers("c1"))

  // The discard of an entry that cannot be decoded stalls before its alert.
  // The sweep requeues the entry and a second consumer discards it.
  run slowDiscard =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(undecodable("c1"))
      .then(discards("c1", true)).then(discards("c1", true))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(undecodable("c2")).then(discardsToTheEnd("c2", true))
      .then(ack("c2"))
      .then(discardsToTheEnd("c1", true)).then(acks("c1"))

  // A consumer stops between sendBatch and the sent mark.
  run diesAfterPush =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true))
      .then(starts("c1")).then(sendsBatch("c1", true))
      .then(abandon("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(delivers("c2"))

  // An entry that cannot be decoded is discarded, and its ack fails.
  run ackFailsAfterDiscard =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(defect("c1")).then(discardsToTheEnd("c1", true))
      .then(abandon("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(dequeue("c2")).then(defect("c2")).then(discardsToTheEnd("c2", true))
      .then(ack("c2"))

  // The process ends between the commit of the third failure and its alert.
  run diesBeforeAlert =
    initWith(LAST_RETRY)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true))
      .then(starts("c1")).then(sendsBatch("c1", false)).then(retryLater("c1", true))
      .then(abandon("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(delivers("c2"))
  run foreignRow =
    initWith(0)
      .then(polls("p1")).then(enqueues("p1"))
      .then(rowAges).then(sweepRelease)
      .then(polls("p2")).then(enqueues("p2"))
      .then(dequeue("c1")).then(dequeue("c2")).then(claimRows("c2", true))
      .then(claimRows("c1", false)).then(retryLater("c1", true))
      .then(settles("c1")).then(alertsIfDue("c1")).then(ack("c1"))
      .then(cannotClaim("c1")).then(cannotClaim("c1"))
}

module queue_current {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "dequeue", PUSH_STAMP = true, DEAD_LETTER_ONCE = true,
    DISCARD_KEEPS_CLAIM = true,
    QUIET_CONSUMER_RESUMES = true, DISCARD_OUTLASTS_CLAIM = true,
    LOSES_AFTER_PUSH = true, LOSES_AFTER_DEAD_LETTER = true, LOSES_AFTER_ALERT = false
  ).*

  run doublePollTest = doublePoll.expect(pushes == 1 and row.status == Sent)
  run backlogReleaseTest = backlogRelease.expect(pushes == 1 and row.status == Sent)
  run deadLetterWriteFailsOnceTest = deadLetterWriteFailsOnce.expect(and {
    deadLetters.get(0) == 1, alerts.get(0) == 1, row.status == Failed,
  })
  // The first consumer started its push, so the redelivery does not push
  // again: it fails the row as unconfirmed, with one dead letter and alert.
  run thirdFailureDeadLetterFailsTest = thirdFailureDeadLetterFails.expect(and {
    pushes == 0, deadLetters.get(0) == 1, alerts.get(0) == 1, row.status == Failed,
    row.retry == LAST_RETRY,
  })
  run foreignRowTest = foreignRow.expect(and {
    row.status == Queued, row.deliveryMessageId == 1, deadLetters.get(0) == 0,
  })
}

// The four gaps of #379, each with today's code and the one thing the world
// does to open it.
module queue_quiet_consumer {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "dequeue", PUSH_STAMP = true, DEAD_LETTER_ONCE = true,
    DISCARD_KEEPS_CLAIM = true,
    QUIET_CONSUMER_RESUMES = true, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run lateAckTest = lateAck.expect(and {
    deliveries[1].state == Held,
    inFlight.keys() == Set(1),
    claimedAt.keys() == Set(1),
    consumers.get("c2").pc == Claimed,
    pushes == 0,
  })
  run lateAckPushesOnceTest =
    lateAck.then(sends("c2")).expect(pushes == 1 and row.status == Sent)
  run quietBeforeThePushTest = quietBeforeThePush.expect(pushes == 1 and row.status == Sent)
  // The redelivery cannot tell whether the quiet consumer pushed, so it
  // fails the row with a dead letter. The quiet consumer then pushes once.
  run quietAtTheSendTest = quietAtTheSend.expect(and {
    pushes == 1, row.status == Failed, deadLetters.get(0) == 1, alerts.get(0) == 1,
  })
  run quietThenFailsTest = quietThenFails.expect(and {
    pushes == 1, row.status == Sent, row.retry == 0,
  })
}

module queue_slow_discard {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "dequeue", PUSH_STAMP = true, DEAD_LETTER_ONCE = true,
    DISCARD_KEEPS_CLAIM = true,
    QUIET_CONSUMER_RESUMES = true, DISCARD_OUTLASTS_CLAIM = true,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run slowDiscardTest = slowDiscard.expect(deadLetters.get(0) == 1 and alerts.get(0) == 1)
}

module queue_lost_after_push {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "dequeue", PUSH_STAMP = true, DEAD_LETTER_ONCE = true,
    DISCARD_KEEPS_CLAIM = true,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = true, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run diesAfterPushTest = diesAfterPush.expect(and {
    pushes == 1, row.status == Failed, deadLetters.get(0) == 1, alerts.get(0) == 1,
  })
}

module queue_lost_after_dead_letter {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "dequeue", PUSH_STAMP = true, DEAD_LETTER_ONCE = true,
    DISCARD_KEEPS_CLAIM = true,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = true, LOSES_AFTER_ALERT = false
  ).*

  run ackFailsAfterDiscardTest =
    ackFailsAfterDiscard.expect(deadLetters.get(0) == 1 and alerts.get(0) == 1)
  run diesBeforeAlertTest = diesBeforeAlert.expect(and {
    deadLetters.get(0) == 1, alerts.get(0) == 1, row.status == Failed,
  })
}

// What today's code still leans on: a consumer that stops between an alert
// and the commit that records it leaves the redelivery to alert again. The
// other order would lose the alert.
module queue_lost_after_alert {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "dequeue", PUSH_STAMP = true, DEAD_LETTER_ONCE = true,
    DISCARD_KEEPS_CLAIM = true,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = true, LOSES_AFTER_ALERT = true
  ).*

  run alertsTwiceTest =
    initWith(LAST_RETRY)
      .then(polls("p1")).then(enqueues("p1"))
      .then(dequeue("c1")).then(claimRows("c1", true))
      .then(starts("c1")).then(sendsBatch("c1", false)).then(retryLater("c1", true))
      .then(alertThenStop("c1"))
      .then(expire(0)).then(sweepRequeue(0))
      .then(delivers("c2"))
      .expect(deadLetters.get(0) == 1 and alerts.get(0) == 2)
}

// Today's code with the row claim keyed by the message alone. The push
// stamp stops the second push of a quiet consumer, and not the retry of a
// quiet consumer that fails behind the redelivery that sent.
module queue_message_row_claim {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = true, DEAD_LETTER_ONCE = true,
    DISCARD_KEEPS_CLAIM = true,
    QUIET_CONSUMER_RESUMES = true, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run quietThenFailsTest = quietThenFails.expect(pushes == 2)
}

// The code before the fix of #379, with the four things it leaned on.
module queue_before_379 {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = true, DISCARD_OUTLASTS_CLAIM = true,
    LOSES_AFTER_PUSH = true, LOSES_AFTER_DEAD_LETTER = true, LOSES_AFTER_ALERT = false
  ).*

  run lateAckPushesTwiceTest =
    lateAck.then(push("c2", true)).expect(pushes == 2)
  run quietBeforeThePushTest = quietBeforeThePush.expect(pushes == 2)
  run slowDiscardTest = slowDiscard.expect(deadLetters.get(0) == 2 and alerts.get(0) == 2)
  run diesAfterPushTest = diesAfterPush.expect(pushes == 2)
  run ackFailsAfterDiscardTest =
    ackFailsAfterDiscard.expect(deadLetters.get(0) == 2 and alerts.get(0) == 2)
  run diesBeforeAlertTest = diesBeforeAlert.expect(and {
    deadLetters.get(0) == 1, alerts.get(0) == 0, row.status == Failed,
  })
}

module queue_before_82 {
  import queue_claims(
    SCHEDULER_CLAIMS = false, DELIVERY_CLAIM = false, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run doublePollTest = doublePoll.expect(pushes == 2)
}

// The poll of before #82 with the row claim of before #379. The claim
// covers two polls that overlap. It does not cover a late markManyAsQueued
// that puts a sent row back to queued under the message that sent it.
module queue_read_then_mark {
  import queue_claims(
    SCHEDULER_CLAIMS = false, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run doublePollTest = doublePoll.expect(pushes == 1)
}

module queue_no_delivery_claim {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = false, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run backlogReleaseTest = backlogRelease.expect(pushes == 2)
}

module queue_raw_claim {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "raw",
    REFRESHES = false, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
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
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
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
    POISON_ORDER = "alertLast", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run thirdFailureDeadLetterFailsTest = thirdFailureDeadLetterFails.expect(and {
    deadLetters.get(0) == 0, alerts.get(0) == 0, row.status == Failed,
  })
}

module queue_alert_first {
  import queue_claims(
    SCHEDULER_CLAIMS = true, DELIVERY_CLAIM = true, CLAIM_BY = "token",
    REFRESHES = true, RETRY = "postgres", DEAD_LETTER_IN_TX = true,
    POISON_ORDER = "alertFirst", ROW_CLAIM_BY = "message", PUSH_STAMP = false, DEAD_LETTER_ONCE = false,
    DISCARD_KEEPS_CLAIM = false,
    QUIET_CONSUMER_RESUMES = false, DISCARD_OUTLASTS_CLAIM = false,
    LOSES_AFTER_PUSH = false, LOSES_AFTER_DEAD_LETTER = false, LOSES_AFTER_ALERT = false
  ).*

  run deadLetterWriteFailsOnceTest =
    deadLetterWriteFailsOnce.expect(alerts.get(0) == 2 and deadLetters.get(0) == 1)
}
