import { Match, pipe, String } from 'effect'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSendMagicLink, useVerifyCode } from '@/hooks/use-auth'

type Step = 'email' | 'code'

export const LoginPage = () => {
  const navigate = useNavigate()
  const sendMagicLink = useSendMagicLink()
  const verifyCode = useVerifyCode()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')

  const handleSendLink = (e: React.FormEvent) => {
    e.preventDefault()
    sendMagicLink.mutate(email, {
      onSuccess: () => setStep('code'),
    })
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    verifyCode.mutate(code, {
      onSuccess: () => navigate('/jobs'),
    })
  }

  const errorMessage = sendMagicLink.error?.message ?? verifyCode.error?.message

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900">Lily Admin</h2>
        <p className="mt-1 text-sm text-gray-500">
          Sign in with your admin account.
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {pipe(
          Match.value(step),
          Match.when('email', () => (
            <form
              key="email"
              onSubmit={handleSendLink}
              className="mt-5 space-y-4"
            >
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <button
                type="submit"
                disabled={
                  pipe(email, String.trim, String.isEmpty) ||
                  sendMagicLink.isPending
                }
                className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sendMagicLink.isPending ? 'Sending...' : 'Send magic link'}
              </button>
            </form>
          )),
          Match.when('code', () => (
            <form key="code" onSubmit={handleVerify} className="mt-5 space-y-4">
              <p className="text-sm text-gray-600">
                We sent a magic link to <strong>{email}</strong>. Paste the code
                from the link below.
              </p>
              <div>
                <label
                  htmlFor="code"
                  className="block text-sm font-medium text-gray-700"
                >
                  Verification code
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <button
                type="submit"
                disabled={
                  pipe(code, String.trim, String.isEmpty) ||
                  verifyCode.isPending
                }
                className="w-full rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {verifyCode.isPending ? 'Verifying...' : 'Verify & sign in'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  sendMagicLink.reset()
                  verifyCode.reset()
                }}
                className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
            </form>
          )),
          Match.exhaustive
        )}
      </div>
    </div>
  )
}
