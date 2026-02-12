import { cn } from '@/lib/utils'

export function MeshGradient({ className }: { className?: string }) {
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      aria-hidden="true"
    >
      {/* Base layer */}
      <div className="absolute inset-0 bg-mesh-1" />

      {/* Animated gradient blobs */}
      <div
        className="mesh-blob-1 absolute -top-1/4 -left-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-1) 0%, transparent 70%)',
        }}
      />
      <div
        className="mesh-blob-2 absolute -top-1/4 -right-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-2) 0%, transparent 70%)',
        }}
      />
      <div
        className="mesh-blob-3 absolute -bottom-1/4 -left-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-3) 0%, transparent 70%)',
        }}
      />
      <div
        className="mesh-blob-4 absolute -bottom-1/4 -right-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-4) 0%, transparent 70%)',
        }}
      />

      {/* Softening blur overlay */}
      <div className="absolute inset-0 backdrop-blur-3xl" />
    </div>
  )
}

export function MeshGradientDark({ className }: { className?: string }) {
  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-mesh-dark-1" />

      <div
        className="mesh-blob-1 absolute -top-1/4 -left-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-dark-1) 0%, transparent 70%)',
        }}
      />
      <div
        className="mesh-blob-2 absolute -top-1/4 -right-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-dark-2) 0%, transparent 70%)',
        }}
      />
      <div
        className="mesh-blob-3 absolute -bottom-1/4 -left-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-dark-3) 0%, transparent 70%)',
        }}
      />
      <div
        className="mesh-blob-4 absolute -bottom-1/4 -right-1/4 h-3/4 w-3/4 rounded-full opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--color-mesh-dark-4) 0%, transparent 70%)',
        }}
      />

      <div className="absolute inset-0 backdrop-blur-3xl" />
    </div>
  )
}
