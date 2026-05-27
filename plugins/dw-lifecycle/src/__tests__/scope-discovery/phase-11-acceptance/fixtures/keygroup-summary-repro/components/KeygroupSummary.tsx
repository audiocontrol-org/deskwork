// SYNTHETIC FIXTURE — Phase 11 acceptance criterion
//
// Reproduces the SHAPE of the audiocontrol KeygroupSummary regression
// (issue #315) WITHOUT copying any real audiocontrol code. The shape is:
//
//   - ZERO canonical-primitive imports (no `@audiocontrol/editor-core`,
//     no `@/components/common/*`, no design-system module imports).
//   - >= 14 utility-class hits (Tailwind-like inline classes such as
//     `flex`, `bg-*`, `text-*`, `p-*`, `m-*`, `border-*`, `grid`,
//     `absolute`, etc).
//
// This file MUST survive every pre-Phase-11 scanner pass (the catalog
// only knew positive-match regex, with no catalog entry describing the
// canonical-primitive-absence shape). The Phase 11 acceptance test
// asserts that the new negative-space + outlier + coverage handlers
// catch this shape now.

// Plain React imports — NO canonical-primitive imports of any kind.
import * as React from 'react';

interface KeygroupSummaryProps {
  readonly name: string;
  readonly count: number;
  readonly status: string;
}

// Hit counter (Tailwind-style utility class hits to exceed the >=14 threshold):
//   line  hit-shapes
//   wrap  flex, bg-slate-50, border-slate-200, p-4, m-2                  (5)
//   row1  grid, gap-2, p-2                                               (3)
//   row2  text-sm, text-slate-700, bg-white                              (3)
//   row3  border, border-slate-300, p-3                                  (3)
//   row4  flex, absolute, bg-amber-100, text-amber-900                   (4)
// Total utility hits = 18 (well above the >= 14 threshold the test asserts).
export function KeygroupSummary(props: KeygroupSummaryProps): React.JSX.Element {
  return (
    <div className="flex bg-slate-50 border-slate-200 p-4 m-2">
      <div className="grid gap-2 p-2">
        <span className="text-sm text-slate-700 bg-white">{props.name}</span>
        <span className="border border-slate-300 p-3">{props.count}</span>
        <span className="flex absolute bg-amber-100 text-amber-900">{props.status}</span>
      </div>
    </div>
  );
}
