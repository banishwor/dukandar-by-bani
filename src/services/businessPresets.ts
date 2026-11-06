// Business-Type Presets
//
// Picking a Business Category in the setup wizard applies a sensible
// starting configuration for that kind of shop. A preset is ONLY a
// starting point: every value it sets lives in ordinary settings that
// stay fully editable afterwards in Settings (Store & Register
// Preferences and Dashboard Layout & Widgets). Nothing is locked —
// e.g. a services business that later starts selling perishable goods
// just turns Expiry Date Tracking on in Settings and the full expiry
// feature set (item batches, dashboard watchlist, POS columns) appears.

import type { DashboardPreferences, PrintFormat } from '../types';
import { DEFAULT_DASHBOARD_PREFERENCES } from './dashboardPreferencesService';

export interface BusinessPreset {
  id: string;
  label: string;
  enableExpiryTracking: boolean;
  allowNegativeStock: boolean;
  defaultPrintFormat: PrintFormat;
  /** Dashboard widget overrides merged over the defaults. */
  dashboard: Partial<DashboardPreferences>;
  /** Short human-readable lines describing the starting configuration. */
  summaryLines: string[];
}

const GENERAL_RETAIL: BusinessPreset = {
  id: 'general-retail',
  label: 'General Retail',
  enableExpiryTracking: false,
  allowNegativeStock: true,
  defaultPrintFormat: 'A4',
  dashboard: { showNearExpiry: false },
  summaryLines: [
    'Expiry tracking OFF',
    'Negative stock allowed',
    'Near-expiry alerts OFF',
    'A4 invoice printing',
  ],
};

const PERISHABLES: BusinessPreset = {
  id: 'perishables',
  label: 'Perishables',
  enableExpiryTracking: true,
  allowNegativeStock: false,
  defaultPrintFormat: 'A4',
  dashboard: { showNearExpiry: true, showLowStock: true },
  summaryLines: [
    'Expiry tracking ON',
    'Negative stock OFF (stock stays accurate)',
    'Near-expiry alerts ON',
    'A4 invoice printing',
  ],
};

const WHOLESALE: BusinessPreset = {
  id: 'wholesale',
  label: 'Wholesale',
  enableExpiryTracking: false,
  allowNegativeStock: true,
  defaultPrintFormat: 'A4',
  dashboard: { showNearExpiry: false },
  summaryLines: [
    'Expiry tracking OFF',
    'Negative stock allowed',
    'Near-expiry alerts OFF',
    'A4 invoice printing',
  ],
};

const FOOD_SERVICE: BusinessPreset = {
  id: 'food-service',
  label: 'Food Service',
  enableExpiryTracking: true,
  allowNegativeStock: true,
  defaultPrintFormat: 'THERMAL',
  dashboard: { showNearExpiry: true },
  summaryLines: [
    'Expiry tracking ON (ingredients)',
    'Negative stock allowed',
    'Near-expiry alerts ON',
    'Thermal receipt printing',
  ],
};

const SERVICES: BusinessPreset = {
  id: 'services',
  label: 'Services',
  enableExpiryTracking: false,
  allowNegativeStock: true,
  defaultPrintFormat: 'A4',
  dashboard: { showNearExpiry: false, showLowStock: false },
  summaryLines: [
    'Expiry tracking OFF',
    'Negative stock allowed',
    'Near-expiry and low-stock alerts OFF',
    'A4 invoice printing',
  ],
};

const WORKSHOP: BusinessPreset = {
  id: 'workshop',
  label: 'Workshop',
  enableExpiryTracking: false,
  allowNegativeStock: false,
  defaultPrintFormat: 'A4',
  dashboard: { showNearExpiry: false },
  summaryLines: [
    'Expiry tracking OFF',
    'Negative stock OFF (material stays accurate)',
    'Near-expiry alerts OFF',
    'A4 invoice printing',
  ],
};

const CATEGORY_PRESETS: Record<string, BusinessPreset> = {
  'Retail Store': GENERAL_RETAIL,
  'Grocery / Supermarket': PERISHABLES,
  'Wholesale Trader': WHOLESALE,
  'Services & Consulting': SERVICES,
  'Electronics & Hardware': GENERAL_RETAIL,
  'Restaurant & Cafe': FOOD_SERVICE,
  'Pharmacy / Medical': PERISHABLES,
  'Garments & Apparel': GENERAL_RETAIL,
  'Manufacturing / Workshop': WORKSHOP,
  'Other Business': GENERAL_RETAIL,
};

/** The preset a setup-wizard category starts with (General Retail fallback). */
export function getBusinessPreset(category: string): BusinessPreset {
  return CATEGORY_PRESETS[category] ?? GENERAL_RETAIL;
}

/** Dashboard preferences a fresh business with this preset starts with. */
export function presetDashboardPreferences(preset: BusinessPreset): DashboardPreferences {
  return { ...DEFAULT_DASHBOARD_PREFERENCES, ...preset.dashboard };
}
