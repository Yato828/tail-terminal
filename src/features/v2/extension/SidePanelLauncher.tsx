import { useEffect, useState } from 'react';
import { errorMessage } from '../../../lib/validation';
import { extensionChrome } from './chrome';
import './extension.css';
export function SidePanelLauncher() {
  const [error, setError] = useState(''), [windowId, setWindowId] = useState<number>();
  useEffect(() => { void extensionChrome()?.windows?.getCurrent().then(win => setWindowId(win.id)).catch(() => {}); }, []);
  return <div className="v2-panel-launcher"><button aria-label="Open companion side panel" onClick={() => {
    const api = extensionChrome(); if (!api?.sidePanel || windowId === undefined) { setError('Side panel requires the installed extension in Chrome 116+.'); return; }
    void api.sidePanel.open({ windowId }).catch(e => setError(errorMessage(e)));
  }}>Side panel</button>{error && <small role="alert">{error}</small>}</div>;
}
