import { useEffect, useRef } from 'react';

// Subscribes to the server's SSE event stream and calls `onChange` whenever
// another session mutates schedule data, so open pages stay in sync without
// polling. A ref holds the callback so the connection doesn't get torn down
// and reopened every time the caller's function identity changes — callers
// don't need to useCallback their reload function for this to work.
export function useLiveRefresh(onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const source = new EventSource('/api/events');
    source.onmessage = () => onChangeRef.current();
    return () => source.close();
  }, []);
}
