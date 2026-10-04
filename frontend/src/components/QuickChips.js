import React from 'react';
import { t, locale } from '../i18n';
import { priorityName } from '../names';
import { recurrenceHow } from '../recurrence';
import { labelTextColor } from '../labels';
import '../styles/TaskForm.css';

// What quick entry recognized in a title (quickEntry.js), as chips under the
// input -- in the task form and the quick add on My day.

// "Fri, Oct 9"; with the year when it isn't this one ("1.10." after October 1st is next year's).
const chipDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {};
  return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', ...year });
};

/** What a recognized part sets, as text ("📅 Fri, Oct 9", "⚑ High", …). */
export function quickChipText(token) {
  switch (token.kind) {
    case 'deadline':
      return `📅 ${chipDate(token.value)}`;
    case 'start':
      return `▶ ${t('from {date}', { date: chipDate(token.value) })}`;
    case 'range':
      return `📅 ${chipDate(token.value[0])} – ${chipDate(token.value[1])}`;
    case 'repeat':
      return `↻ ${recurrenceHow(token.value.unit, token.value.interval, { recurrence_weekdays: token.value.weekdays })}`;
    case 'priority':
      return `⚑ ${priorityName(token.value)}`;
    case 'label':
      return token.label.name;
    default:
      return `👤 ${token.user.username}`;
  }
}

/**
 * The chips for `quick` (parseQuickEntry's result); × on one calls
 * onIgnore(token.key) so that word stays in the title. With nothing
 * recognized: the hint what can be typed (unless hint is false).
 */
function QuickChips({ quick, onIgnore, hint = true }) {
  if (!quick) return null;
  if (!quick.tokens.length) {
    return hint ? (
      <small className="form-hint">{t('Quick: tomorrow, fri, 5.10., every monday, from 5.10. · !high · #label · @name')}</small>
    ) : null;
  }
  return (
    <div className="quick-chips" aria-live="polite">
      {quick.tokens.map((tok) => (
        <span
          key={tok.key}
          className={`quick-chip quick-${tok.kind}`}
          style={tok.kind === 'label' ? { backgroundColor: tok.label.color, color: labelTextColor(tok.label.color) } : undefined}
        >
          {quickChipText(tok)}
          <button
            type="button"
            onClick={() => onIgnore(tok.key)}
            title={t('Keep “{text}” in the title', { text: tok.text })}
            aria-label={t('Keep “{text}” in the title', { text: tok.text })}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export default QuickChips;
