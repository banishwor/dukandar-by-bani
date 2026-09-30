import type { DashboardPreferences } from '../types';

const STORAGE_KEY = 'dukandar_dashboard_preferences';
export const DASHBOARD_PREFS_CHANGED_EVENT = 'dukandar:dashboard_preferences_changed';

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  showProfitPerformance: true,
  showLowStock: true,
  showNearExpiry: true,
  showRecentPurchases: true,
  showRecentSales: true,
  showLiquidityStrip: true,
};

export const dashboardPreferencesService = {
  getPreferences(): DashboardPreferences {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return { ...DEFAULT_DASHBOARD_PREFERENCES };
      const parsed = JSON.parse(stored);
      return {
        showProfitPerformance: parsed.showProfitPerformance !== false,
        showLowStock: parsed.showLowStock !== false,
        showNearExpiry: parsed.showNearExpiry !== false,
        showRecentPurchases: parsed.showRecentPurchases !== false,
        showRecentSales: parsed.showRecentSales !== false,
        showLiquidityStrip: parsed.showLiquidityStrip !== false,
      };
    } catch {
      return { ...DEFAULT_DASHBOARD_PREFERENCES };
    }
  },

  savePreferences(prefs: DashboardPreferences): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      window.dispatchEvent(new CustomEvent(DASHBOARD_PREFS_CHANGED_EVENT, { detail: prefs }));
    } catch (err) {
      console.error('Failed to save dashboard preferences', err);
    }
  },

  resetPreferences(): DashboardPreferences {
    const defaults = { ...DEFAULT_DASHBOARD_PREFERENCES };
    this.savePreferences(defaults);
    return defaults;
  },
};
