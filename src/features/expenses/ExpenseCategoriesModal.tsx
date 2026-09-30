import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { expenseService } from '../../services/expenseService';
import type { ExpenseCategory } from '../../types';
import { Tag, Plus, Archive, RotateCcw, Edit2 } from 'lucide-react';

interface ExpenseCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  categories: ExpenseCategory[];
  onCategoriesChanged: () => void;
}

export const ExpenseCategoriesModal: React.FC<ExpenseCategoriesModalProps> = ({
  isOpen,
  onClose,
  businessId,
  categories,
  onCategoriesChanged,
}) => {
  const { showSuccess, showError } = useToast();

  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setSaving(true);
    try {
      await expenseService.createCategory(businessId, { name: newCatName.trim() });
      showSuccess(`Category "${newCatName}" added.`);
      setNewCatName('');
      onCategoriesChanged();
    } catch (err: any) {
      showError(err.message || 'Failed to add category');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await expenseService.updateCategory(id, { name: editingName.trim() });
      showSuccess('Category updated.');
      setEditingId(null);
      onCategoriesChanged();
    } catch (err: any) {
      showError(err.message || 'Failed to update category');
    }
  };

  const handleArchive = async (cat: ExpenseCategory) => {
    try {
      if (cat.isArchived) {
        await expenseService.restoreCategory(cat.id);
        showSuccess(`Category "${cat.name}" restored.`);
      } else {
        await expenseService.archiveCategory(cat.id);
        showSuccess(`Category "${cat.name}" archived.`);
      }
      onCategoriesChanged();
    } catch (err: any) {
      showError(err.message || 'Failed to update category');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Expense Categories" maxWidth="md">
      <div className="space-y-4">
        {/* Add New Category Input */}
        <form onSubmit={handleAddCategory} className="flex gap-2">
          <Input
            placeholder="Add new category (e.g., Software Subscriptions)..."
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            className="flex-1"
          />
          <Button variant="primary" type="submit" isLoading={saving} disabled={!newCatName.trim()}>
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </form>

        {/* Existing Categories List */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {categories.map((cat) => {
            const isEditing = editingId === cat.id;

            return (
              <div
                key={cat.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-colors ${
                  cat.isArchived
                    ? 'bg-slate-50 border-slate-200/80 opacity-60 text-slate-400'
                    : 'bg-white border-slate-200/80 text-slate-800 shadow-2xs hover:bg-slate-50/50'
                }`}
              >
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
                    />
                    <Button variant="primary" size="sm" onClick={() => handleSaveEdit(cat.id)}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-blue-500" />
                    <span className="font-semibold text-slate-800">{cat.name}</span>
                    {cat.isArchived && (
                      <Badge variant="neutral" className="text-[9px] py-0">
                        Archived
                      </Badge>
                    )}
                  </div>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingId(cat.id);
                        setEditingName(cat.name);
                      }}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleArchive(cat)}
                      className={`p-1 ${cat.isArchived ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'}`}
                    >
                      {cat.isArchived ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
