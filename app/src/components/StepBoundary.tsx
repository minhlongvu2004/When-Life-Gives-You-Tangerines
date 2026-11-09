"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Safety net for one step of the engine. If a step fails to draw, show what happened and a way back instead of
 * leaving the whole page blank. Give it a `key` that changes with the step so moving to another step resets it.
 */
export class StepBoundary extends Component<{ children: ReactNode; label: string; onBack: () => void }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] could not be shown`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-10 w-full max-w-lg rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight">This step didn&apos;t load</h2>
        <p className="mt-2 text-sm text-ink-2">Something went wrong while showing {this.props.label}. The customer and your settings are still here.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button onClick={() => this.setState({ error: null })} className="btn btn-primary rounded-full px-4 py-2 text-sm">
            Try again
          </button>
          <button
            onClick={() => {
              this.setState({ error: null });
              this.props.onBack();
            }}
            className="btn btn-outline rounded-full px-4 py-2 text-sm"
          >
            Back to Customer
          </button>
        </div>
        <details className="mt-4 text-left text-xs text-muted">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-2 break-words whitespace-pre-wrap">{error.message}</pre>
        </details>
      </div>
    );
  }
}
