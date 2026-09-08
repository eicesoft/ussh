import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { PersistedWidthPanel } from '../../src/components/ui/persisted-width-panel';

function Fixture() {
  const [widths, setWidths] = useState(() => JSON.parse(localStorage.getItem('panel-width-test') || '{"left":280,"right":360}'));
  const [visible, setVisible] = useState(true);
  const save = (side, { inPixels }) => {
    if (!inPixels) return;
    setWidths(prev => {
      const next = { ...prev, [side]: Math.round(inPixels) };
      localStorage.setItem('panel-width-test', JSON.stringify(next));
      return next;
    });
  };
  return <>
    <button onClick={() => setVisible(v => !v)}>Toggle right</button>
    <Group orientation="horizontal" style={{ height: 400 }}>
      <PersistedWidthPanel id="left" defaultSize={widths.left} minSize={100} onResize={size => save('left', size)} groupResizeBehavior="preserve-pixel-size">Left</PersistedWidthPanel>
      <Separator style={{ width: 6 }} />
      <Panel minSize={visible ? 310 : 160}>
        <Group orientation="horizontal" style={{ width: '100%' }}>
          <Panel minSize={160}>Center</Panel>
          {visible && <>
            <Separator style={{ width: 6 }} />
            <PersistedWidthPanel id="right" defaultSize={widths.right} minSize={150} onResize={size => save('right', size)} groupResizeBehavior="preserve-pixel-size">Right</PersistedWidthPanel>
          </>}
        </Group>
      </Panel>
    </Group>
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
