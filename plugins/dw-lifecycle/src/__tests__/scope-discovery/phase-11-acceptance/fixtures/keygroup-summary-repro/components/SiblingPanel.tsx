// SYNTHETIC FIXTURE — Phase 11 acceptance criterion
//
// Third directory sibling so the outlier handler has population >= 2 of
// HEALTHY peers. Also consumes the canonical primitive; should not fire.

import * as React from 'react';
import { Card } from '@/components/common/Card';

export function SiblingPanel(): React.JSX.Element {
  return (
    <Card title="sibling" className="ds-card ds-card-bordered">
      <span className="ds-text">peer to HealthySummary</span>
    </Card>
  );
}
