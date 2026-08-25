import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Business } from '../types';
import { businessRepository } from '../repositories/businessRepository';
import { getPersistentDeviceId } from '../utils/deviceId';

interface BusinessContextType {
  business: Business | null;
  isLoading: boolean;
  deviceId: string;
  isOnline: boolean;
  refreshBusiness: () => Promise<void>;
  createBusiness: (data: Omit<Business, 'id' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>) => Promise<Business>;
  updateBusiness: (updates: Partial<Business>) => Promise<void>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export const BusinessProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [business, setBusiness] = useState<Business | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [deviceId] = useState(() => getPersistentDeviceId());

  const refreshBusiness = useCallback(async () => {
    try {
      const active = await businessRepository.getActiveBusiness();
      setBusiness(active || null);
    } catch (err) {
      console.error('Failed to load business profile from local database', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBusiness();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshBusiness]);

  const createBusiness = async (
    data: Omit<Business, 'id' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>
  ) => {
    const created = await businessRepository.createBusiness(data);
    setBusiness(created);
    return created;
  };

  const updateBusiness = async (updates: Partial<Business>) => {
    if (!business) return;
    await businessRepository.updateBusiness(business.id, updates);
    await refreshBusiness();
  };

  return (
    <BusinessContext.Provider
      value={{
        business,
        isLoading,
        deviceId,
        isOnline,
        refreshBusiness,
        createBusiness,
        updateBusiness,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
};
