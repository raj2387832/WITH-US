import { useCallback } from 'react';
import { useAuth } from '@workspace/replit-auth-web';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
function apiUrl(path: string) { return `${BASE}/api${path}`; }

export function useCredits() {
  const { isAuthenticated, login } = useAuth();

  const useCredit = useCallback(async (tool: string): Promise<{ ok: boolean; balance?: number; error?: string }> => {
    if (!isAuthenticated) {
      return { ok: false, error: 'login_required' };
    }

    try {
      const res = await fetch(apiUrl('/credits/use'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool }),
      });
      const data = await res.json();

      if (res.ok) {
        return { ok: true, balance: data.balance };
      }

      if (res.status === 402) {
        return { ok: false, error: 'no_credits', balance: 0 };
      }

      if (res.status === 401) {
        return { ok: false, error: 'login_required' };
      }

      return { ok: false, error: data.error ?? 'Failed to use credit' };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }, [isAuthenticated]);

  return { useCredit, isAuthenticated, login };
}
