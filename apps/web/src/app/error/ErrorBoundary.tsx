import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { Sentry } from "@web/lib/sentry";

export interface ErrorFallbackProps {
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
  hasError: boolean;
  hasRetried: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, hasRetried: false };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { boundary: this.props.boundaryName ?? "unknown" },
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  private readonly reset = () => {
    this.setState({ hasError: false, hasRetried: true });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          reset: this.reset,
          hasRetried: this.state.hasRetried,
        });
      }
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
