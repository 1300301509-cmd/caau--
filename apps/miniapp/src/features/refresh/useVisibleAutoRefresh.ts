import { useEffect, useRef } from 'react';
import { useDidHide, useDidShow } from '@tarojs/taro';

/** Refresh on return and while this page is visible, without replacing local edits. */
export function useVisibleAutoRefresh(
  load: () => Promise<void> | void,
  enabled = true,
  intervalMs = 20_000,
  startOnMount = false,
) {
  const loadRef = useRef(load);
  const enabledRef = useRef(enabled);
  const intervalRef = useRef(intervalMs);
  const visible = useRef(false);
  const hiddenSinceMount = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cycle = useRef(0);
  const tick = useRef<() => void>();
  loadRef.current = load;
  enabledRef.current = enabled;
  intervalRef.current = intervalMs;

  tick.current = () => {
    const current = cycle.current;
    if (!visible.current || !enabledRef.current) return;
    void (async () => {
      try {
        await loadRef.current();
      } catch {
        // Individual pages surface their own request errors and retry action.
      } finally {
        if (
          cycle.current === current &&
          visible.current &&
          enabledRef.current
        ) {
          timer.current = setTimeout(
            () => tick.current?.(),
            intervalRef.current,
          );
        }
      }
    })();
  };

  const stop = () => {
    cycle.current += 1;
    clearTimeout(timer.current);
  };
  const start = () => {
    stop();
    if (enabledRef.current && visible.current) tick.current?.();
  };

  useDidShow(() => {
    visible.current = true;
    start();
  });
  useDidHide(() => {
    visible.current = false;
    hiddenSinceMount.current = true;
    stop();
  });
  const previousEnabled = useRef(enabled);
  useEffect(() => {
    if (!enabled) stop();
    else if (!previousEnabled.current && visible.current) start();
    previousEnabled.current = enabled;
  }, [enabled]);
  useEffect(
    () => () => {
      visible.current = false;
      stop();
    },
    [],
  );
  useEffect(() => {
    if (!startOnMount || hiddenSinceMount.current) return;
    visible.current = true;
    stop();
    if (enabledRef.current)
      timer.current = setTimeout(() => tick.current?.(), intervalRef.current);
  }, [startOnMount]);
}
