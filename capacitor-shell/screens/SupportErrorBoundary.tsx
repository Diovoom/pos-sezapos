// User-safe error boundary for the Android Support screen.
//
// Catches any unexpected render error (including minified React errors like
// #310) and shows a plain-language recovery UI instead of exposing raw
// stack traces, table names, or Supabase errors to the employee.
import { Component, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Props = {
  children: ReactNode;
  /** Called when the user taps "Back to Register". */
  onExit?: () => void;
};
type State = { hasError: boolean; nonce: number };

export class SupportErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, nonce: 0 };

  static getDerivedStateFromError(): State {
    return { hasError: true, nonce: 0 };
  }

  componentDidCatch(error: unknown) {
    // Log for diagnostics; never surface raw error to the UI.
    // eslint-disable-next-line no-console
    import.meta.env.DEV && console.error("[support] render error", error);
  }

  private retry = () => this.setState((s) => ({ hasError: false, nonce: s.nonce + 1 }));

  render() {
    if (!this.state.hasError) {
      return <div key={this.state.nonce}>{this.props.children}</div>;
    }
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Support could not be loaded</AlertTitle>
          <AlertDescription>
            Something went wrong showing this screen. You can try again or
            return to the register.
          </AlertDescription>
        </Alert>
        <div className="flex flex-col gap-2">
          <Button onClick={this.retry} className="min-h-11">
            <RefreshCw className="size-4 mr-2" /> Retry
          </Button>
          {this.props.onExit && (
            <Button variant="outline" onClick={this.props.onExit} className="min-h-11">
              <ArrowLeft className="size-4 mr-2" /> Back to Register
            </Button>
          )}
        </div>
      </div>
    );
  }
}
