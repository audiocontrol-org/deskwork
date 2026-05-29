// SYNTHETIC FIXTURE — Phase 11 acceptance criterion
//
// Healthy sibling to KeygroupSummary.tsx. Same glob; same component
// shape (a Summary component); BUT consumes the canonical design-system
// primitive (`@/components/common/Card`). Should NOT fire on any of the
// Phase 11 negative-space / coverage handlers, and provides the
// directory-sibling population so the outlier handler can compute a
// per-directory centroid.

import * as React from 'react';
// Canonical-primitive consumption — the very thing the catalog asks for.
import { Card } from '@/components/common/Card';

interface HealthySummaryProps {
  readonly name: string;
  readonly value: number;
}

export function HealthySummary(props: HealthySummaryProps): React.JSX.Element {
  return (
    <Card title={props.name} className="ds-card ds-card-bordered">
      <span className="ds-text">{props.value}</span>
    </Card>
  );
}

interface AnotherHealthySummaryProps {
  readonly text: string;
}

export function AnotherHealthySummary(
  props: AnotherHealthySummaryProps,
): React.JSX.Element {
  return (
    <Card title={props.text} className="ds-card ds-card-flush">
      <span className="ds-text">via canonical primitive</span>
    </Card>
  );
}
