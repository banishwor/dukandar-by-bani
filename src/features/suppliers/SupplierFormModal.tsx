import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { supplierRepository } from '../../repositories/supplierRepository';
import type { Supplier } from '../../types';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdSupplier?: Supplier) => void;
  initialSupplier?: Supplier | null;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialSupplier,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [isMobile, setIsMobile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [notes, setNotes] = useState('');

  const [nameError, setNameError] = useState('');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (initialSupplier) {
      setName(initialSupplier.name);
      setPhone(initialSupplier.phone || '');
      setEmail(initialSupplier.email || '');
      setAddress(initialSupplier.address || '');
      setTaxId(initialSupplier.taxId || '');
      setPaymentTerms(initialSupplier.paymentTerms || '');
      setNotes(initialSupplier.notes || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setTaxId('');
      setPaymentTerms('');
      setNotes('');
    }
    setNameError('');
  }, [initialSupplier, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    if (!name.trim()) {
      setNameError('Supplier or vendor name is required');
      return;
    }
    setNameError('');

    try {
      setIsSubmitting(true);
      if (initialSupplier) {
        await supplierRepository.updateSupplier(initialSupplier.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          taxId: taxId.trim() || undefined,
          paymentTerms: paymentTerms.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        showSuccess(`Updated ${name}`);
        onSuccess();
      } else {
        const created = await supplierRepository.createSupplier(business.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          taxId: taxId.trim() || undefined,
          paymentTerms: paymentTerms.trim() || undefined,
          notes: notes.trim() || undefined,
          isActive: true,
        });
        showSuccess(`Added supplier ${name}`);
        onSuccess(created);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save supplier', err);
      showError('Unable to save supplier profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Supplier / Vendor Name"
        required
        autoFocus
        placeholder="e.g. Acme Wholesale, Metro Distributors"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Phone Number"
          type="tel"
          placeholder="+91 98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label="Email Address"
          type="email"
          placeholder="supplier@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="GST / Tax ID (Optional)"
          placeholder="e.g. 29AAAAA0000A1Z5"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
        />
        <Input
          label="Payment Terms (Optional)"
          placeholder="e.g. Net 15, Net 30, Cash on Delivery"
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5 text-left">
        <label className="text-xs font-semibold text-slate-700">Supplier Address</label>
        <textarea
          rows={2}
          placeholder="Warehouse / Office address, City, Pincode"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>

      <div className="flex flex-col gap-1.5 text-left">
        <label className="text-xs font-semibold text-slate-700">Internal Notes (Optional)</label>
        <input
          type="text"
          placeholder="e.g. Key contact: Mr. Sharma, delivers on Tuesdays"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {initialSupplier ? 'Update Supplier' : 'Save Supplier'}
        </Button>
      </div>
    </form>
  );

  const title = initialSupplier ? `Edit ${initialSupplier.name}` : 'Add New Supplier';
  const subtitle = 'Save supplier contact details, tax info, and payables ledger';

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle}>
        {formContent}
      </BottomSheet>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} maxWidth="md">
      {formContent}
    </Modal>
  );
};
