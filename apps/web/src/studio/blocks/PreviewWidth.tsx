import { SegmentedControl } from '@gurukul/ui';
import { useState } from 'react';
import type { ReactNode } from 'react';

const WIDTHS = [
  { value: '1280', label: '1280 px' },
  { value: '390', label: '390 px' },
] as const;

/**
 * A frame the size of the lesson column on a 1280 px desktop or a 390 px phone, for showing a block
 * as a learner will see it. The width switch is the frame's own; `children` is the learner's own
 * rendering, so what it shows is what publishing will show.
 */
export function PreviewWidth({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState<'1280' | '390'>('1280');
  return (
    <div className="studio-previewwidth">
      <div className="studio-group">
        <span className="studio-group__label">Preview as a learner sees it</span>
        <SegmentedControl
          label="Preview width"
          value={width}
          options={WIDTHS}
          onChange={setWidth}
        />
      </div>
      <div className="studio-previewwidth__frame" data-width={width}>
        {children}
      </div>
    </div>
  );
}
