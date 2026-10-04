import React, { useEffect, useState } from 'react';
import { locale } from '../i18n';

// Date and time in the top bar, so you always know where you are in the day.
export const clockDate = (now) => now.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
export const clockTime = (now) => now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

function NavClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer;
    // Tick on the minute boundary, and catch up at once when the tab comes back
    // (background tabs throttle timers).
    const tick = () => {
      const d = new Date();
      setNow(d);
      clearTimeout(timer);
      timer = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    };
    const onVisible = () => document.visibilityState === 'visible' && tick();
    tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <time className="nav-clock" dateTime={now.toISOString()} title={now.toLocaleString(locale(), { dateStyle: 'full', timeStyle: 'short' })}>
      <span className="nav-clock-date">{clockDate(now)}</span>
      <span className="nav-clock-time">{clockTime(now)}</span>
    </time>
  );
}

export default NavClock;
