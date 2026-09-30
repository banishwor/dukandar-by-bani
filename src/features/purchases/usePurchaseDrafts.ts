import { useState, useCallback, useEffect } from 'react';
import type { DiscountType, PaymentMethod } from '../../types';
import type { PurchaseCartLine } from './SpreadsheetPurchaseGrid';

export interface PurchaseDraft {
  id: string;
  title: string;
  supplierId: string;
  vendorInvoiceNumber: string;
  vendorInvoiceDate: string;
  lines: PurchaseCartLine[];
  overallDiscountType: DiscountType;
  overallDiscountValue: string;
  paymentMode: 'FULL' | 'UNPAID' | 'PARTIAL';
  customPaidAmount: string;
  paymentMethod: PaymentMethod;
  financialAccountId: string;
  notes: string;
  createdAt: number;
}

const STORAGE_KEY = 'dukandar_active_purchase_drafts_v1';
const ACTIVE_DRAFT_KEY = 'dukandar_active_purchase_draft_id_v1';

const createNewPurchaseDraftState = (index: number, defaultAccountId = ''): PurchaseDraft => ({
  id: `pur_draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  title: `Inward #${index}`,
  supplierId: '',
  vendorInvoiceNumber: '',
  vendorInvoiceDate: new Date().toISOString().split('T')[0],
  lines: [],
  overallDiscountType: 'NONE',
  overallDiscountValue: '',
  paymentMode: 'FULL',
  customPaidAmount: '',
  paymentMethod: 'CASH',
  financialAccountId: defaultAccountId,
  notes: '',
  createdAt: Date.now(),
});

export function usePurchaseDrafts(defaultAccountId = '') {
  // Initialize drafts from localStorage or create first draft
  const [drafts, setDrafts] = useState<PurchaseDraft[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to restore purchase drafts from localStorage:', e);
    }
    return [createNewPurchaseDraftState(1, defaultAccountId)];
  });

  const [activeDraftId, setActiveDraftId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(ACTIVE_DRAFT_KEY);
      if (savedId && drafts.some((d) => d.id === savedId)) {
        return savedId;
      }
    } catch {}
    return drafts[0]?.id || '';
  });

  // Ensure activeDraftId always points to a valid draft
  useEffect(() => {
    if (!drafts.some((d) => d.id === activeDraftId) && drafts.length > 0) {
      setActiveDraftId(drafts[0].id);
    }
  }, [drafts, activeDraftId]);

  // Persist to localStorage whenever drafts or activeDraftId change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
      localStorage.setItem(ACTIVE_DRAFT_KEY, activeDraftId);
    } catch (e) {
      console.warn('Failed to save purchase drafts to localStorage:', e);
    }
  }, [drafts, activeDraftId]);

  // Update default account if initial drafts lacked one
  useEffect(() => {
    if (defaultAccountId) {
      setDrafts((prev) =>
        prev.map((d) =>
          !d.financialAccountId ? { ...d, financialAccountId: defaultAccountId } : d
        )
      );
    }
  }, [defaultAccountId]);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) || drafts[0];

  const updateActiveDraft = useCallback(
    (updates: Partial<PurchaseDraft>) => {
      setDrafts((prev) =>
        prev.map((d) => (d.id === activeDraftId ? { ...d, ...updates } : d))
      );
    },
    [activeDraftId]
  );

  const addNewDraft = useCallback(() => {
    setDrafts((prev) => {
      const newDraft = createNewPurchaseDraftState(prev.length + 1, defaultAccountId);
      setActiveDraftId(newDraft.id);
      return [...prev, newDraft];
    });
  }, [defaultAccountId]);

  const closeDraft = useCallback(
    (draftId: string) => {
      setDrafts((prev) => {
        if (prev.length <= 1) {
          // If closing the last draft, reset it to a clean draft
          const fresh = createNewPurchaseDraftState(1, defaultAccountId);
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
              ...createNewPurchaseDraftState(1, defaultAccountId),
              id: activeDraftId,
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
