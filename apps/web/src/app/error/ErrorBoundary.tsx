import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

export interface ErrorFallbackProps {
  error: Error;
  reset: () => void;
  hasRetried: boolean;
  eventId?: string;
  componentStack?: string;
  route?: string;
  timestamp?: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackRender?: (props: ErrorFallbackProps) => ReactNode;
  boundaryName?: string;
  // 백엔드 error-mapper.ts의 EXPECTED_DOMAIN_CODES와 같은 목적 — 사용자 액션으로
  // 자연히 발생하는 예상된 에러(예: 방금 닫힌 리뷰의 NOT_FOUND)까지 Sentry로 보내
  // 노이즈를 만들지 않기 위한 opt-out. 생략하면 기존과 동일하게 항상 보고한다.
  shouldReport?: (error: Error) => boolean;
}

interface State {
  error: Error | null;
  hasError: boolean;
  hasRetried: boolean;
  eventId?: string;
  componentStack?: string;
  route?: string;
  timestamp?: string;
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
    // Sentry 없이는 보고할 곳이 없다 — eventId는 원래 전 계층에서 optional이라
    // undefined로 둬도 ErrorFallback 등 나머지는 그대로 돈다.
    this.setState({
      eventId: undefined,
      componentStack: errorInfo.componentStack ?? undefined,
      route: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
  }

  private readonly reset = () => {
    this.setState({
      error: null,
      hasError: false,
      hasRetried: true,
      eventId: undefined,
      componentStack: undefined,
      route: undefined,
      timestamp: undefined,
    });
  };

  override render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          reset: this.reset,
          hasRetried: this.state.hasRetried,
          eventId: this.state.eventId,
          componentStack: this.state.componentStack,
          route: this.state.route,
          timestamp: this.state.timestamp,
        });
      }
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
