/**
 * Authentication UI
 *
 * Shows a full-screen login overlay before the main application loads.
 * Returns the authenticated user once login succeeds.
 *
 * Flow:
 *  1. If a stored token exists, validate it with GET /api/me.
 *     - Success → return the user immediately (no login screen shown).
 *     - Failure → clear stale credentials, show login screen.
 *  2. Login screen → POST /api/login → store token → return user.
 */

import { apiLogin, apiGetMe, clearAuth, getToken, AuthUser } from './libs/api';
import { loadLogoDataUrl } from './logo';

/**
 * Ensure the user is authenticated.
 * - If a valid token is already stored, silently re-validates and returns the user.
 * - Otherwise shows a login overlay and waits for successful authentication.
 */
export async function requireAuth(): Promise<AuthUser> {
  // Try to re-use an existing token
  if (getToken()) {
    try {
      const user = await apiGetMe();
      return user;
    } catch {
      clearAuth();
      // Fall through to login screen
    }
  }

  return showLoginScreen();
}

/**
 * Renders the login overlay and resolves when the user authenticates.
 */
async function showLoginScreen(): Promise<AuthUser> {
  const logoDataUrl = await loadLogoDataUrl();
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Logo" class="login-logo-img" />`
    : `<div class="login-logo-icon">A3</div>`;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.innerHTML = `
      <div class="login-card">
        <div class="login-logo">
          ${logoHtml}
        </div>

        <form id="login-form" autocomplete="on" novalidate>
          <div class="login-field">
            <label for="login-username">Username</label>
            <input
              type="text"
              id="login-username"
              name="username"
              autocomplete="username"
              placeholder="Enter username"
              required
              autofocus
            />
          </div>

          <div class="login-field">
            <label for="login-password">Password</label>
            <input
              type="password"
              id="login-password"
              name="password"
              autocomplete="current-password"
              placeholder="Enter password"
              required
            />
          </div>

          <div id="login-error" class="login-error" style="display:none"></div>

          <button type="submit" class="login-btn" id="login-submit">
            Sign In
          </button>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const form      = document.getElementById('login-form') as HTMLFormElement;
    const userInput = document.getElementById('login-username') as HTMLInputElement;
    const passInput = document.getElementById('login-password') as HTMLInputElement;
    const errorDiv  = document.getElementById('login-error') as HTMLDivElement;
    const submitBtn = document.getElementById('login-submit') as HTMLButtonElement;

    function showError(msg: string) {
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
      passInput.value = '';
      passInput.focus();
    }

    function setLoading(loading: boolean) {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading ? 'Signing in…' : 'Sign In';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = userInput.value.trim();
      const password = passInput.value;

      if (!username || !password) {
        showError('Please enter your username and password.');
        return;
      }

      errorDiv.style.display = 'none';
      setLoading(true);

      try {
        const user = await apiLogin(username, password);
        // Fade out then remove overlay
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity    = '0';
        setTimeout(() => overlay.remove(), 320);
        resolve(user);
      } catch (err) {
        setLoading(false);
        showError((err as Error).message || 'Invalid username or password.');
      }
    });
  });
}

/**
 * Log out the current user: clears credentials and reloads the page
 * so the login screen is shown.
 */
export function logout(): void {
  clearAuth();
  window.location.reload();
}
