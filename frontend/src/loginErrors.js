import { t } from './i18n';

// What the server answers (401) when the password is right but the account
// needs a code from the authenticator app (backend routers/auth.py).
export const TWO_FACTOR_REQUIRED = 'Two-factor code required';

/** An Error for a failed login answer; .twoFactor when the code is what's missing. */
export async function loginError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  const detail = typeof data.detail === 'string' ? data.detail : '';
  const err = new Error(detail ? t(detail) : fallback);
  err.twoFactor = res.status === 401 && detail === TWO_FACTOR_REQUIRED;
  return err;
}
