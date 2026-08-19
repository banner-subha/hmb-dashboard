import { Component } from 'react';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleRetry = () => {
    const isModuleError = this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
                          this.state.error?.name === 'ChunkLoadError';
    if (isModuleError) {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: null });
    }
  };

  handleRelogin = () => {
    localStorage.removeItem('hmb_auth');
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Something went wrong';

      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-primary">
          <div className="glass-card p-8 max-w-md w-full mx-4 text-center space-y-5">
            <div className="mx-auto w-14 h-14 rounded-full bg-severity-critical/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-severity-critical" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-text-primary">Unexpected Error</h2>
              <p className="text-sm text-text-muted leading-relaxed">
                The dashboard encountered an error while loading. This can happen due to network issues or a temporary glitch.
              </p>
              {errorMsg !== 'Something went wrong' && (
                <p className="text-xs text-text-muted/60 font-mono mt-2 px-3 py-1.5 bg-bg-card rounded-md inline-block">
                  {errorMsg}
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all duration-200 hover:brightness-110"
                style={{ background: 'var(--gradient-accent)' }}
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
              <button
                onClick={this.handleRelogin}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-text-primary border border-border hover:bg-bg-card transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Re-login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
