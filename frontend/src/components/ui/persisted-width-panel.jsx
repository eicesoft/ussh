import { useRef } from 'react';
import { Panel } from 'react-resizable-panels';

// Changing defaultSize re-registers a Panel and interrupts an active drag.
// Restore the saved width once per mount; onResize can keep persisting updates.
export function PersistedWidthPanel({ defaultSize, ...props }) {
  const initialSize = useRef(defaultSize);
  return <Panel {...props} defaultSize={initialSize.current} />;
}
