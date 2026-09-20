import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TabErrorBoundaryProps {
  resetKey: string;
  onReset?: () => void;
  children: ReactNode;
}

interface TabErrorBoundaryState {
  error: Error | null;
}

export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Tab rendering error", error, info);
  }

  componentDidUpdate(previousProps: TabErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
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
          <CardTitle>This view hit an error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="break-words font-mono text-xs text-muted">{this.state.error.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={this.retry}>Try again</Button>
            <Button variant="secondary" onClick={this.backToStart}>
              Back to Start Here
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
}
