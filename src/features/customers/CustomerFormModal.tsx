import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/ui/Modal';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { customerRepository } from '../../repositories/customerRepository';
import type { Customer } from '../../types';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdCustomer?: Customer) => void;
  initialCustomer?: Customer | null;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCustomer,
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
  const [notes, setNotes] = useState('');

  const [nameError, setNameError] = useState('');

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (initialCustomer) {
      setName(initialCustomer.name);
      setPhone(initialCustomer.phone || '');
      setEmail(initialCustomer.email || '');
      setAddress(initialCustomer.address || '');
      setNotes(initialCustomer.notes || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setNotes('');
    }
    setNameError('');
  }, [initialCustomer, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    if (!name.trim()) {
      setNameError('Customer name is required');
      return;
    }
    setNameError('');

    try {
      setIsSubmitting(true);
      if (initialCustomer) {
        await customerRepository.updateCustomer(initialCustomer.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        showSuccess(`Updated ${name}`);
        onSuccess();
      } else {
        const created = await customerRepository.createCustomer(business.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
          isActive: true,
        });
        showSuccess(`Added customer ${name}`);
        onSuccess(created);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save customer', err);
      showError('Unable to save customer profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Customer Name"
        required
        autoFocus
        placeholder="e.g. Ramesh Kumar, Priya Sharma"
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
          placeholder="customer@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5 text-left">
        <label className="text-xs font-semibold text-slate-700">Billing Address</label>
        <textarea
          rows={2}
          placeholder="Shop / House No, Street, City"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
      </div>

      <div className="flex flex-col gap-1.5 text-left">
        <label className="text-xs font-semibold text-slate-700">Notes (Optional)</label>
        <input
          type="text"
          placeholder="e.g. Regular customer, prefers UPI"
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
          {initialCustomer ? 'Update Customer' : 'Save Customer'}
        </Button>
      </div>
    </form>
  );

  const title = initialCustomer ? `Edit ${initialCustomer.name}` : 'Add New Customer';
  const subtitle = 'Save customer contact and credit tracking details';

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
