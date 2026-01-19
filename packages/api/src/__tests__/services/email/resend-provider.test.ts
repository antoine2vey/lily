import {
  clearSentEmails,
  createMockEmailService,
  getLastSentEmail,
  getSentEmails,
  wasEmailSentTo,
} from '@lily/api/__tests__/mocks/email.service'
import { EmailService } from '@lily/shared/server'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('EmailService (mock)', () => {
  afterEach(() => {
    clearSentEmails()
  })

  describe('send', () => {
    it('should send email successfully', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'test@example.com',
            subject: 'Test Subject',
            html: '<p>Test body</p>',
          })
        }).pipe(Effect.provide(createMockEmailService()))
      )

      expect(result._tag).toBe('Success')
    })

    it('should track sent emails', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'recipient@example.com',
            subject: 'Welcome',
            html: '<h1>Welcome!</h1>',
          })
        }).pipe(Effect.provide(createMockEmailService()))
      )

      const sentEmails = getSentEmails()
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0]?.to).toBe('recipient@example.com')
      expect(sentEmails[0]?.subject).toBe('Welcome')
    })

    it('should get last sent email', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'first@example.com',
            subject: 'First',
            html: '<p>First</p>',
          })
          yield* emailService.send({
            to: 'second@example.com',
            subject: 'Second',
            html: '<p>Second</p>',
          })
        }).pipe(Effect.provide(createMockEmailService()))
      )

      const lastEmail = getLastSentEmail()
      expect(lastEmail?.to).toBe('second@example.com')
      expect(lastEmail?.subject).toBe('Second')
    })

    it('should check if email was sent to address', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'user@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
          })
        }).pipe(Effect.provide(createMockEmailService()))
      )

      expect(wasEmailSentTo('user@example.com')).toBe(true)
      expect(wasEmailSentTo('other@example.com')).toBe(false)
    })

    it('should include text content if provided', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'test@example.com',
            subject: 'With Text',
            html: '<p>HTML content</p>',
            text: 'Plain text content',
          })
        }).pipe(Effect.provide(createMockEmailService()))
      )

      const lastEmail = getLastSentEmail()
      expect(lastEmail?.text).toBe('Plain text content')
    })

    it('should fail with EmailSendError when configured to fail', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'test@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
          })
        }).pipe(
          Effect.provide(
            createMockEmailService({
              shouldFail: true,
              failureMessage: 'SMTP connection failed',
            })
          )
        )
      )

      expect(result._tag).toBe('Failure')
    })

    it('should not track emails when send fails', async () => {
      await Effect.runPromiseExit(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'test@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
          })
        }).pipe(
          Effect.provide(
            createMockEmailService({
              shouldFail: true,
            })
          )
        )
      )

      expect(getSentEmails()).toHaveLength(0)
    })

    it('should handle multiple recipients in sequence', async () => {
      const recipients = [
        'user1@example.com',
        'user2@example.com',
        'user3@example.com',
      ]

      await Effect.runPromise(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          for (const to of recipients) {
            yield* emailService.send({
              to,
              subject: 'Batch Email',
              html: '<p>Batch content</p>',
            })
          }
        }).pipe(Effect.provide(createMockEmailService()))
      )

      const sentEmails = getSentEmails()
      expect(sentEmails).toHaveLength(3)
      expect(wasEmailSentTo('user1@example.com')).toBe(true)
      expect(wasEmailSentTo('user2@example.com')).toBe(true)
      expect(wasEmailSentTo('user3@example.com')).toBe(true)
    })

    it('should clear emails between tests', async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const emailService = yield* EmailService
          yield* emailService.send({
            to: 'test@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
          })
        }).pipe(Effect.provide(createMockEmailService()))
      )

      expect(getSentEmails()).toHaveLength(1)

      clearSentEmails()

      expect(getSentEmails()).toHaveLength(0)
    })
  })
})
