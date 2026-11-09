/**
 * Error Boundary Component
 * React 19 Error Boundary for graceful error handling
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X, Bug, AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  context?: string;
  onError?: (error: Error, errorInfo: ErrorInfo, context?: string) => void;
  resetKeys?: unknown[];
  fallbackRender?: (error: Error, resetError: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ error, errorInfo });

    // Log error to console
    console.error(`[ErrorBoundary${this.props.context ? `:${this.props.context}` : ''}] Caught error:`, error, errorInfo);

    // Call optional onError callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo, this.props.context);
    }

    // Report to global error handler if available
    if (typeof window !== 'undefined') {
      // Try electronAPI first (new preload API)
      if ((window as any).electronAPI?.logRendererError) {
        (window as any).electronAPI.logRendererError(error, {
          componentStack: errorInfo.componentStack,
          boundary: this.constructor.name,
          context: this.props.context,
        });
      } else if ((window as any).reportError) {
        // Fallback to legacy reportError
        (window as any).reportError(error, {
          componentStack: errorInfo.componentStack,
          boundary: this.constructor.name,
          context: this.props.context,
        });
      }
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset error state when resetKeys change
    if (this.props.resetKeys && this.props.resetKeys !== prevProps.resetKeys) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback render
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender(this.state.error, this.resetError);
      }

      // Default fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-6 bg-gray-800/50 rounded-xl border border-red-500/30">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-red-500/20 rounded-lg flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-white mb-2">Something went wrong</h3>
              <p className="text-sm text-gray-400 mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>

              {this.state.errorInfo?.componentStack && (
                <details className="mb-4">
                  <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                    Show technical details
                  </summary>
                  <pre className="mt-2 p-3 bg-gray-900 rounded text-xs text-gray-300 overflow-x-auto max-h-40 overflow-y-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={this.resetError}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>

                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

// Specialized error boundaries for different components
export const TranscriptErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallbackRender={(_error, resetError) => (
      <div className="p-4 bg-gray-800/50 rounded-xl border border-yellow-500/30">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-gray-300">Transcript display error</p>
            <p className="text-xs text-gray-500 mt-1">Real-time captions may be temporarily unavailable</p>
          </div>
          <button
            onClick={resetError}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

export const OverlayErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallbackRender={(_error, resetError) => (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <div className="bg-red-900/90 backdrop-blur-sm rounded-xl border border-red-500/30 p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-white mb-1">Overlay Error</p>
              <p className="text-sm text-red-200 mb-3">The floating overlay encountered an error and was disabled</p>
              <div className="flex gap-2">
                <button
                  onClick={resetError}
                  className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Re-enable Overlay
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Reload
                </button>
              </div>
            </div>
            <button
              onClick={resetError}
              className="text-red-300 hover:text-red-200 flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

export const AnswerCardErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallbackRender={(_error, resetError) => (
      <div className="p-4 bg-gray-800/50 rounded-xl border border-red-500/30">
        <div className="flex items-center gap-3">
          <Bug className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-white mb-1">Answer generation failed</p>
            <p className="text-sm text-gray-400">Unable to generate AI response at this time</p>
          </div>
          <button
            onClick={resetError}
            className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Retry Answer
          </button>
        </div>
      </div>
    )}
  >
    {children}
  </ErrorBoundary>
);

// Hook for using error boundary in functional components
export function useErrorHandler(): (error: Error) => void {
  const [, setState] = React.useState({});

  return React.useCallback((error: Error) => {
    setState(prev => ({ ...prev, error }));
    // This will trigger the nearest ErrorBoundary
    throw error;
  }, []);
}

export default ErrorBoundary;
export { ErrorBoundary };