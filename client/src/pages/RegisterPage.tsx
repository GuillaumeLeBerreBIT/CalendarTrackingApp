import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'

// ── Shared logo (calendar icon + wordmark) ────────────────────
function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <span style={{
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color: 'var(--text-1)',
        lineHeight: 1,
      }}>
        Eventli
      </span>
    </div>
  )
}

// ── Styled input wrapper ──────────────────────────────────────
interface FieldProps {
  label: string
  type: string
  value: string
  placeholder: string
  onChange: (v: string) => void
  required?: boolean
  autoComplete?: string
}

function Field({ label, type, value, placeholder, onChange, required, autoComplete }: FieldProps) {
  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isPassword = type === 'password'
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 550,
        color: 'var(--text-2)',
        marginBottom: 6,
      }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          type={resolvedType}
          required={required}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            background: 'var(--surface-2)',
            border: `1px solid ${focused ? 'var(--accent-line)' : 'var(--border-2)'}`,
            borderRadius: 'var(--r-sm)',
            color: 'var(--text-1)',
            fontSize: 14,
            padding: isPassword ? '11px 44px 11px 13px' : '11px 13px',
            outline: 'none',
            transition: 'border-color var(--transition)',
            boxSizing: 'border-box',
            minHeight: 44,
          }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 44,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <Icon name="close" size={16} /> : <Icon name="sun" size={16} />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── RegisterPage ──────────────────────────────────────────────
export default function RegisterPage() {
  const navigate = useNavigate()
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const [form, setForm] = useState({
    email: '',
    username: '',
    password: '',
    passwordConfirm: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (form.password !== form.passwordConfirm) {
      setError('Passwords do not match.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/register', form)
      if (data.success) {
        await fetchMe()
        navigate('/')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fields: { label: string; field: keyof typeof form; type: string; placeholder: string; autoComplete?: string }[] = [
    { label: 'Email',            field: 'email',           type: 'email',    placeholder: 'you@example.com', autoComplete: 'email'            },
    { label: 'Username',         field: 'username',        type: 'text',     placeholder: 'yourname',        autoComplete: 'username'         },
    { label: 'Password',         field: 'password',        type: 'password', placeholder: '••••••••',        autoComplete: 'new-password'     },
    { label: 'Confirm password', field: 'passwordConfirm', type: 'password', placeholder: '••••••••',        autoComplete: 'new-password'     },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo + subtitle */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Logo />
          </div>
          <p style={{
            fontSize: 14,
            color: 'var(--text-3)',
            margin: 0,
          }}>
            Create your account
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--r-xl)',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(244,63,94,0.12)',
              border: '1px solid rgba(244,63,94,0.3)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 13px',
              fontSize: 13,
              color: '#fb7185',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {fields.map(({ label, field, type, placeholder, autoComplete }) => (
              <Field
                key={field}
                label={label}
                type={type}
                value={form[field]}
                placeholder={placeholder}
                onChange={(v) => set(field, v)}
                required
                autoComplete={autoComplete}
              />
            ))}
            <div style={{ marginTop: 4 }}>
              <Button
                variant="primary"
                full
                size="lg"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </div>
          </form>
        </div>

        {/* Footer link */}
        <p style={{
          textAlign: 'center',
          fontSize: 13.5,
          color: 'var(--text-3)',
          marginTop: 20,
        }}>
          Already have an account?{' '}
          <Link
            to="/login"
            style={{
              color: 'var(--accent)',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
