import { Component, type ReactNode } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { Empty } from './components';

export function WorkspaceSkeleton() {
  return <div aria-busy="true" role="status" aria-label="Loading workspace">
    <div className="skeleton skeleton-title" />
    <div className="skeleton skeleton-hero" />
    <div className="stats-grid" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}
    </div>
    <div className="overview-panels" aria-hidden="true">
      <div className="skeleton skeleton-panel" /><div className="skeleton skeleton-panel" />
    </div>
  </div>;
}

export function WorkspaceFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section className="surface state-panel" role="alert">
    <Empty icon={CircleAlert} title="Workspace unavailable" text={message}
      action={<button className="button secondary" onClick={onRetry}><RefreshCw size={15} /> Try again</button>} />
  </section>;
}

export class WorkspaceBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <WorkspaceFailure message="This view could not be displayed. Reopen it to continue." onRetry={() => {
        this.props.onRetry();
        this.setState({ failed: false });
      }} />;
    }
    return this.props.children;
  }
}
