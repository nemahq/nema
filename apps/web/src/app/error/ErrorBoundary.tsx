import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import * as Sentry from "@sentry/react";

export interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
  hasRetried: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (props: ErrorFallbackProps) => ReactNode;
  boundaryName?: string;
}

interface State {
  error: Error | null;
  hasError: boolean;
  hasRetried: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, hasError: false, hasRetried: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { boundary: this.props.boundaryName ?? "unknown" },
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  private readonly reset = () => {
    this.setState({ error: null, hasError: false, hasRetried: true });
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          reset: this.reset,
          hasRetried: this.state.hasRetried,
        });
      }
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
