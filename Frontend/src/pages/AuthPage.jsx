import React, { useMemo, useState } from 'react'
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import logo from "../assets/logo.png";
/**
 * InputField: minimal, no white outlines/boxes.
 * Icon on the left, centered grey input "pill" on the same row.
 */
const InputField = ({ label, icon: Icon, className = '', ...props }) => {
  return (
    <div className={`w-full space-y-2 ${className}`}>
      <label htmlFor={props.id} className="block text-sm font-medium text-gray-200">
        {label}
      </label>

      <div className="w-full flex items-center gap-3">
        <Icon className="w-5 h-5 text-slate-400 shrink-0" />

        <div className="flex-1 flex items-center">
          <input
            {...props}
            className="
              w-full h-11
              rounded-md
              bg-slate-200/20
              px-4
              text-sm text-slate-100
              placeholder:text-slate-400/60
              outline-none border-none ring-0 shadow-none
              focus:outline-none focus:ring-0 focus:border-none
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          />
        </div>
      </div>
    </div>
  )
}

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({ name: '', email: '', password: '' })
  const [logoError, setLogoError] = useState(false)

  const navigate = useNavigate()

  const title = isLogin ? 'Welcome back' : 'Create account'
  const subtitle = isLogin
    ? 'Enter your credentials to access your account.'
    : 'Join us today and start your journey.'

  const endpoint = useMemo(() => (isLogin ? '/auth/login' : '/auth/register'), [isLogin])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (error) setError('')
  }

  const toggleMode = () => {
    setIsLogin((v) => !v)
    setError('')
    setFormData((prev) => ({
      name: '',
      email: prev.email,
      password: '',
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const payload = isLogin
        ? { email: formData.email.trim(), password: formData.password }
        : { name: formData.name.trim(), email: formData.email.trim(), password: formData.password }

      const data = await api.post(endpoint, payload)

      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/dashboard')
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Something went wrong. Please try again.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden z-0">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-[420px] h-[420px] bg-accent/20 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.10)_1px,transparent_0)] [background-size:28px_28px] opacity-30" />
      </div>

      <div className="glass-panel w-full max-w-3xl p-10 rounded-2xl relative z-10 animate-fade-in shadow-2xl shadow-black/30">
        {/* Logo - smaller size */}
        <div className="flex justify-center mb-6">
          {!logoError ? (
            <img
                src={logo}
                alt="Logo"
                className="h-12 w-auto object-contain"
                onError={() => setLogoError(true)}
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-xl">
              G
            </div>
          )}
        </div>

        {/* Header - more compact */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
            {title}
          </h2>
          <p className="text-muted-foreground text-base">{subtitle}</p>

          {error && (
            <div
              role="alert"
              className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm inline-block"
            >
              {error}
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="w-full">
          <div className="w-full max-w-[1200px] mx-auto space-y-5">
            {!isLogin && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <InputField
                    id="name"
                    label="Full name"
                    icon={User}
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="John Doe"
                    autoComplete="name"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <InputField
                  id="email"
                  label="Email address"
                  icon={Mail}
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="flex gap-3">
                <div className="flex-1">
                    <InputField
                    id="password"
                    label="Password"
                    icon={Lock}
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    disabled={isLoading}
                    required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="
                    h-11 px-6 rounded-md
                    bg-slate-200/25 hover:bg-slate-200/35
                    text-white font-semibold text-sm
                    transition-all duration-200
                    flex items-center gap-2
                    disabled:opacity-60 disabled:cursor-not-allowed
                    shrink-0
                    mt-7
                    "
                >
                    {isLoading ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing…</span>
                    </>
                    ) : (
                    <>
                        <span>{isLogin ? 'Sign in' : 'Create account'}</span>
                        <ArrowRight style={{ width: 30, height: 80 }} />
                    </>
                    )}
                </button>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              onClick={toggleMode}
              disabled={isLoading}
              className="text-slate-100 hover:text-white font-semibold underline underline-offset-2 disabled:opacity-70 transition-colors"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default AuthPage