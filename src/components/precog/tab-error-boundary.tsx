import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { reportClientError } from "@/lib/observability/report-browser";

interface TabErrorBoundaryProps {
  resetKey: string;
  onReset?: () => void;
  children: ReactNode;
}

interface TabErrorBoundaryState {
  error: Error | null;
}

function isChunkLoadError(error: Error): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  );
}

export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Tab rendering error", error, info);
    if (!isChunkLoadError(error)) reportClientError(error, `tab:${this.props.resetKey}`);
  }

  componentDidUpdate(previousProps: TabErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    if (this.state.error && isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  private backToStart = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Card>
        <CardHeader>
          <CardTitle>
            {isChunkLoadError(this.state.error)
              ? "This view failed to download (connection issue?)."
              : "This view hit an error"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isChunkLoadError(this.state.error) && (
            <p className="break-words font-mono text-xs text-muted">{this.state.error.message}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={this.retry}>
              {isChunkLoadError(this.state.error) ? "Reload page" : "Try again"}
            </Button>
            <Button variant="secondary" onClick={this.backToStart}>
              Back to Start Here
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
