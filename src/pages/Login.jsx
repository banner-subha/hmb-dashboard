import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    const result = login(username, password);
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative" style={{ background: 'var(--gradient-page)' }}>
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <img
            src="/hmb.png"
            alt="HMB Ispat"
            className="h-24 w-auto object-contain select-none rounded-2xl"
            draggable={false}
          />
        </div>
        <h1 className="text-center text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
          HMB Ispat
        </h1>
        <p className="mt-2.5 mb-1 text-center text-[11px] sm:text-xs font-bold uppercase tracking-[0.24em] text-text-muted whitespace-nowrap">
          Operational Intelligence Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="glass-card py-8 px-4 sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-severity-critical/10 border border-severity-critical/25 rounded-xl p-3">
                <p className="text-sm text-severity-critical text-center font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-semibold text-text-secondary mb-1.5">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-[18px] w-[18px] text-text-dim" />
                </div>
                <input
                  type="text"
                  className="search-input pl-10 rounded-xl"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-text-secondary mb-1.5">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-[18px] w-[18px] text-text-dim" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  className="search-input pl-10 pr-10 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-text-dim hover:text-text-primary transition-colors cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:translate-y-[0.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 cursor-pointer"
                style={{ background: 'var(--gradient-accent)', boxShadow: 'var(--shadow-card)' }}
              >
                Sign in to Dashboard
              </button>
            </div>
          </form>

          <div className="mt-7 pt-5 border-t border-border text-center text-xs text-text-muted">
            v1.1 · HMB Executive & Client Portal
          </div>
        </div>
      </div>
    </div>
  );
}
