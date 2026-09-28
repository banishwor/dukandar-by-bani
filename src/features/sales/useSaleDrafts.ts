import { useState, useCallback, useEffect } from 'react';
import type { DiscountType, PaymentMethod } from '../../types';

export interface SaleCartLine {
  itemId: string;
  name: string;
  unit: string;
  rate: number;
  quantity: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  trackInventory: boolean;
  availableStock: number;
  expiryDate?: string;
  batchNumber?: string;
  isNewItem?: boolean;
}

export interface SaleDraft {
  id: string;
  title: string;
  selectedCustomerId: string;
  customerCreditAvailable: number;
  applyCustomerCredit: boolean;
  cart: SaleCartLine[];
  overallDiscountType: DiscountType;
  overallDiscountValue: string;
  paymentMode: 'FULL' | 'UNPAID' | 'PARTIAL';
  customPaidAmount: string;
  cashTenderAmount: string;
  paymentMethod: PaymentMethod;
  financialAccountId: string;
  notes: string;
  createdAt: number;
}

const STORAGE_KEY = 'dukandar_active_sale_drafts_v1';
const ACTIVE_DRAFT_KEY = 'dukandar_active_draft_id_v1';

const createNewDraftState = (index: number, defaultAccountId = ''): SaleDraft => ({
  id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  title: `Sale #${index}`,
  selectedCustomerId: '',
  customerCreditAvailable: 0,
  applyCustomerCredit: false,
  cart: [],
  overallDiscountType: 'NONE',
  overallDiscountValue: '',
  paymentMode: 'FULL',
  customPaidAmount: '',
  cashTenderAmount: '',
  paymentMethod: 'CASH',
  financialAccountId: defaultAccountId,
  notes: '',
  createdAt: Date.now(),
});

export function useSaleDrafts(defaultAccountId = '') {
  // Initialize drafts from localStorage or create first draft
  const [drafts, setDrafts] = useState<SaleDraft[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return [createNewDraftState(1, defaultAccountId)];
  });

  const [activeDraftId, setActiveDraftId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(ACTIVE_DRAFT_KEY);
      if (savedId) return savedId;
    } catch {
      // ignore
    }
    return drafts[0]?.id || '';
  });

  // Ensure activeDraftId always points to a valid draft
  useEffect(() => {
    if (!drafts.some((d) => d.id === activeDraftId) && drafts.length > 0) {
      setActiveDraftId(drafts[0].id);
    }
  }, [drafts, activeDraftId]);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
      localStorage.setItem(ACTIVE_DRAFT_KEY, activeDraftId);
    } catch {
      // ignore
    }
  }, [drafts, activeDraftId]);

  // Update default account if initial drafts lacked one
  useEffect(() => {
    if (defaultAccountId) {
      setDrafts((prev) =>
        prev.map((d) =>
          d.financialAccountId ? d : { ...d, financialAccountId: defaultAccountId }
        )
      );
    }
  }, [defaultAccountId]);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) || drafts[0];

  const updateActiveDraft = useCallback(
    (updates: Partial<SaleDraft>) => {
      setDrafts((prev) =>
        prev.map((d) => (d.id === activeDraftId ? { ...d, ...updates } : d))
      );
    },
    [activeDraftId]
  );

  const addNewDraft = useCallback(() => {
    setDrafts((prev) => {
      const newDraft = createNewDraftState(prev.length + 1, defaultAccountId);
      setActiveDraftId(newDraft.id);
      return [...prev, newDraft];
    });
  }, [defaultAccountId]);

  const closeDraft = useCallback(
    (draftId: string) => {
      setDrafts((prev) => {
        if (prev.length <= 1) {
          // If closing the last draft, reset it to a clean draft
          const fresh = createNewDraftState(1, defaultAccountId);
          setActiveDraftId(fresh.id);
          return [fresh];
        }
        const remaining = prev.filter((d) => d.id !== draftId);
        if (activeDraftId === draftId) {
          const nextActive = remaining[0];
          setActiveDraftId(nextActive.id);
        }
        return remaining;
      });
    },
    [activeDraftId, defaultAccountId]
  );

  const resetCurrentDraft = useCallback(() => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === activeDraftId
          ? {
              ...createNewDraftState(1, defaultAccountId),
              id: d.id,
              title: d.title,
            }
          : d
      )
    );
  }, [activeDraftId, defaultAccountId]);

  return {
    drafts,
    activeDraft,
    activeDraftId,
    setActiveDraftId,
    updateActiveDraft,
    addNewDraft,
    closeDraft,
    resetCurrentDraft,
  };
}
