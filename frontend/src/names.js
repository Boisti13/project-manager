// Display names for task statuses and priorities, in the UI language.
import { t } from './i18n';

export const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];

export function statusName(status) {
  switch (status) {
    case 'todo':
      return t('To Do');
    case 'in_progress':
      return t('In Progress');
    case 'blocked':
      return t('Blocked');
    case 'done':
      return t('Done');
    default:
      return status;
  }
}

export function priorityName(priority) {
  switch (Number(priority)) {
    case 0:
      return t('Low');
    case 1:
      return t('Medium');
    case 2:
      return t('High');
    case 3:
      return t('Critical');
    default:
      return `P${priority}`;
  }
}
