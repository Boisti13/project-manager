import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import NavClock, { clockDate, clockTime } from './NavClock';
import { setLanguage } from '../i18n';

const d = new Date(2026, 9, 4, 9, 5);

afterEach(() => {
  setLanguage('en');
  jest.useRealTimers();
});

test('the top-bar clock shows weekday, date and a zero-padded time in the interface language', () => {
  setLanguage('en');
  expect(clockDate(d)).toBe('Sun, Oct 4');
  expect(clockTime(d)).toBe('09:05 AM');
  setLanguage('de');
  expect(clockDate(d)).toBe('So., 4. Okt.');
  expect(clockTime(d)).toBe('09:05');
});

test('the clock moves on at the next full minute', () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 4, 23, 59, 40));
  setLanguage('de');
  const el = document.createElement('div');
  const root = createRoot(el);
  act(() => root.render(<NavClock />));
  expect(el.textContent).toBe('So., 4. Okt.23:59');
  act(() => jest.advanceTimersByTime(21000));
  expect(el.textContent).toBe('Mo., 5. Okt.00:00');
  act(() => root.unmount());
});
