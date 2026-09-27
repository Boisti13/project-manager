// Windows app: re-run `reload` when a background sync changed the local
// copy, so open screens show the new data. Does nothing in the web app.
import { useEffect, useRef } from 'react';
import { IS_DESKTOP } from './platform';
import { engine } from '.';

export function useSyncRefresh(reload) {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    if (!IS_DESKTOP) return undefined;
    return engine.subscribe((status, changed) => {
      if (changed) latest.current();
    });
  }, []);
}
