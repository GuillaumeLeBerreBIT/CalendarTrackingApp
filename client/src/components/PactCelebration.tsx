import { useEffect, useRef } from 'react'

const COLORS = ['var(--accent)', '#f59e0b', '#ec4899', '#22d3aa', '#38bdf8', '#c084fc', '#f97316']
const COUNT = 36

interface ConfettiPiece {
  x: number
  y: number
  size: number
  color: string
  angle: number
  speed: number
  spin: number
}

interface PactCelebrationProps {
  pactId: number
  onDone?: () => void
}

export default function PactCelebration({ pactId, onDone }: PactCelebrationProps) {
  const key = `pact_celebrated_${pactId}`
  const alreadyFired = sessionStorage.getItem(key)
  const doneRef = useRef(false)

  useEffect(() => {
    if (alreadyFired || doneRef.current) return
    sessionStorage.setItem(key, '1')
    doneRef.current = true
    const timer = setTimeout(() => onDone?.(), 2600)
    return () => clearTimeout(timer)
  }, [])

  if (alreadyFired) return null

  const pieces: ConfettiPiece[] = Array.from({ length: COUNT }, (_, i) => ({
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    size: 6 + Math.random() * 8,
    color: COLORS[i % COLORS.length],
    angle: Math.random() * 360,
    speed: 1.5 + Math.random() * 1.5,
    spin: (Math.random() - 0.5) * 720,
  }))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            borderRadius: 2,
            animation: `confetti-fall-${i % 6} ${p.speed}s ease-in ${(i * 0.04)}s forwards`,
            transform: `rotate(${p.angle}deg)`,
            opacity: 0.9,
          }}
        />
      ))}

      {/* Toast */}
      <div style={{
        position: 'fixed',
        top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--surface)',
        border: '2px solid var(--accent)',
        borderRadius: 'var(--r-xl)',
        padding: '24px 36px',
        textAlign: 'center',
        boxShadow: '0 8px 40px var(--accent-glow)',
        animation: 'pact-toast-in 0.4s cubic-bezier(.34,1.56,.64,1)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>Pact Complete!</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Your reward event is now unlocked.</div>
      </div>

      <style>{`
        @keyframes confetti-fall-0 { to { top: 110%; transform: rotate(360deg); } }
        @keyframes confetti-fall-1 { to { top: 110%; transform: rotate(-540deg) translateX(30px); } }
        @keyframes confetti-fall-2 { to { top: 110%; transform: rotate(720deg) translateX(-20px); } }
        @keyframes confetti-fall-3 { to { top: 110%; transform: rotate(-360deg) translateX(50px); } }
        @keyframes confetti-fall-4 { to { top: 110%; transform: rotate(900deg) translateX(-40px); } }
        @keyframes confetti-fall-5 { to { top: 110%; transform: rotate(180deg) translateX(20px); } }
        @keyframes pact-toast-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  )
}
