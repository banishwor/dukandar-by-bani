import { itemRepository } from '../repositories/itemRepository';
import { customerRepository } from '../repositories/customerRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { purchaseService } from './purchaseService';
import { saleService } from './saleService';
import { paymentService } from './paymentService';
import { financialAccountService } from './financialAccountService';
import { db } from '../db/database';
import type { FinancialAccount } from '../types';

export interface SampleDataSummary {
  itemsCount: number;
  customersCount: number;
  suppliersCount: number;
  purchasesCount: number;
  salesCount: number;
}

export const sampleDataService = {
  /**
   * Populates rich sample data (Products, Customers, Suppliers, Purchases, Sales, Payments)
   * into the given business for immediate demo and testing.
   */
  async loadSampleData(businessId: string): Promise<SampleDataSummary> {
    // 1. Ensure Default Financial Accounts Exist
    let accounts = await financialAccountService.getActiveAccounts(businessId);
    let cashAccount: FinancialAccount | undefined =
      accounts.find((a) => a.type === 'CASH' && a.isDefault) ||
      accounts.find((a) => a.type === 'CASH') ||
      accounts[0];
    let bankAccount: FinancialAccount | undefined =
      accounts.find((a) => a.type === 'BANK') ||
      accounts.find((a) => a.id !== cashAccount?.id) ||
      cashAccount;

    if (!cashAccount) {
      const created = await financialAccountService.createAccount(businessId, {
        name: 'Cash Register / Drawer',
        type: 'CASH',
        isDefault: true,
      });
      cashAccount = created.account;
      accounts = await financialAccountService.getActiveAccounts(businessId);
    }

    if (!bankAccount || bankAccount.id === cashAccount.id) {
      const created = await financialAccountService.createAccount(businessId, {
        name: 'HDFC Current Account (UPI/Card)',
        type: 'BANK',
        isDefault: false,
      });
      bankAccount = created.account;
    }

    // 2. Create Sample Customers
    const sampleCustomerDefs = [
      {
        name: 'Ramesh Kumar Sharma',
        phone: '9876543210',
        email: 'ramesh.sharma@example.com',
        address: 'Shop #4, Main Market, Delhi',
        notes: 'Regular customer with monthly khata account',
        isActive: true,
      },
      {
        name: 'Priya Patel',
        phone: '9812345678',
        email: 'priya.patel@example.com',
        address: 'Flat A-12, Green Park Society',
        notes: 'Prefers UPI payments',
        isActive: true,
      },
      {
        name: 'Amit Verma (Regular Khata)',
        phone: '9898989898',
        email: 'amit.verma@example.com',
        address: 'Sector 14, Near Post Office',
        notes: 'Pays weekly on Saturdays',
        isActive: true,
      },
      {
        name: 'Sunita Devi',
        phone: '9845012345',
        email: '',
        address: 'Station Road, Ward #3',
        notes: 'Cash shopper',
        isActive: true,
      },
    ];

    const existingCustomers = await customerRepository.getCustomers(businessId);
    const createdCustomers = [];
    for (const c of sampleCustomerDefs) {
      const match = existingCustomers.find(
        (ec) => ec.name.toLowerCase() === c.name.toLowerCase()
      );
      if (match) {
        await customerRepository.updateCustomer(match.id, c);
        createdCustomers.push({ ...match, ...c });
      } else {
        const created = await customerRepository.createCustomer(businessId, c);
        createdCustomers.push(created);
      }
    }

    // 3. Create Sample Suppliers
    const sampleSupplierDefs = [
      {
        name: 'Metro Wholesale Distributors',
        phone: '9822011223',
        email: 'orders@metrowholesale.in',
        address: 'Plot 45, Wholesale FMCG Mandi',
        notes: 'Primary FMCG and staples distributor',
        isActive: true,
      },
      {
        name: 'Amul Dairy Supply Agency',
        phone: '9833022334',
        email: 'supply@amuldairy.agency',
        address: 'Booth 8, Industrial Estate',
        notes: 'Daily dairy deliveries',
        isActive: true,
      },
    ];

    const existingSuppliers = await supplierRepository.getSuppliers(businessId);
    const createdSuppliers = [];
    for (const s of sampleSupplierDefs) {
      const match = existingSuppliers.find(
        (es) => es.name.toLowerCase() === s.name.toLowerCase()
      );
      if (match) {
        await supplierRepository.updateSupplier(match.id, s);
        createdSuppliers.push({ ...match, ...s });
      } else {
        const created = await supplierRepository.createSupplier(businessId, s);
        createdSuppliers.push(created);
      }
    }

    // 4. Create Sample Products / Items
    const sampleItemDefs = [
      {
        name: 'Amul Taaza Homogenised Toned Milk 1L',
        type: 'PRODUCT' as const,
        sku: 'MLK-001',
        barcode: '8901262010053',
        category: 'Dairy',
        unit: 'packet',
        costPrice: 65,
        sellingPrice: 74,
        openingStock: 40,
        trackInventory: true,
        lowStockThreshold: 10,
        notes: 'Fresh dairy product. Shelf life: 90 days unopened.',
        isActive: true,
        batches: [
          {
            id: 'b-mlk-01',
            batchNumber: 'LOT-EXP-28SEP',
            expiryDate: '2026-09-28',
            mrp: 74,
            costPrice: 65,
            stockQuantity: 12,
          },
          {
            id: 'b-mlk-02',
            batchNumber: 'LOT-EXP-15OCT',
            expiryDate: '2026-10-15',
            mrp: 74,
            costPrice: 65,
            stockQuantity: 28,
          },
        ],
      },
      {
        name: 'Aashirvaad Superior MP Sharbati Atta 5kg',
        type: 'PRODUCT' as const,
        sku: 'ATT-005',
        barcode: '8901030383709',
        category: 'Groceries',
        unit: 'bag',
        costPrice: 275,
        sellingPrice: 320,
        openingStock: 25,
        trackInventory: true,
        lowStockThreshold: 5,
        notes: '100% pure whole wheat flour.',
        isActive: true,
      },
      {
        name: 'Fortune Sunlite Refined Sunflower Oil 1L',
        type: 'PRODUCT' as const,
        sku: 'OIL-001',
        barcode: '8906007280145',
        category: 'Oil & Ghee',
        unit: 'pouch',
        costPrice: 125,
        sellingPrice: 145,
        openingStock: 30,
        trackInventory: true,
        lowStockThreshold: 6,
        notes: 'Rich in Vitamin E and antioxidants.',
        isActive: true,
      },
      {
        name: 'Tata Salt Vacuum Evaporated 1kg',
        type: 'PRODUCT' as const,
        sku: 'SLT-001',
        barcode: '8904043901006',
        category: 'Spices & Salt',
        unit: 'packet',
        costPrice: 22,
        sellingPrice: 28,
        openingStock: 60,
        trackInventory: true,
        lowStockThreshold: 15,
        notes: 'Desh Ka Namak - iodized.',
        isActive: true,
      },
      {
        name: 'Cadbury Dairy Milk Silk Chocolate 60g',
        type: 'PRODUCT' as const,
        sku: 'CHOC-060',
        barcode: '7622201738410',
        category: 'Snacks & Sweets',
        unit: 'bar',
        costPrice: 75,
        sellingPrice: 90,
        openingStock: 40,
        trackInventory: true,
        lowStockThreshold: 8,
        notes: 'Keep refrigerated in summer.',
        isActive: true,
        batches: [
          {
            id: 'b-choc-01',
            batchNumber: 'LOT-AUG-2026',
            expiryDate: '2026-11-15',
            mrp: 90,
            costPrice: 75,
            stockQuantity: 15,
          },
          {
            id: 'b-choc-02',
            batchNumber: 'LOT-DEC-2026',
            expiryDate: '2027-02-28',
            mrp: 90,
            costPrice: 75,
            stockQuantity: 25,
          },
        ],
      },
      {
        name: 'Maggi 2-Minute Instant Noodles 70g (Pack of 4)',
        type: 'PRODUCT' as const,
        sku: 'MAG-004',
        barcode: '8901058852331',
        category: 'Instant Food',
        unit: 'pack',
        costPrice: 46,
        sellingPrice: 56,
        openingStock: 50,
        trackInventory: true,
        lowStockThreshold: 12,
        notes: 'Favorite masala instant noodles with revised MRPs.',
        isActive: true,
        batches: [
          {
            id: 'b-mag-old',
            batchNumber: 'LOT-OLD-MRP',
            expiryDate: '2026-10-30',
            mrp: 52,
            costPrice: 42,
            stockQuantity: 15,
          },
          {
            id: 'b-mag-new',
            batchNumber: 'LOT-NEW-MRP',
            expiryDate: '2027-04-15',
            mrp: 56,
            costPrice: 46,
            stockQuantity: 35,
          },
        ],
      },
      {
        name: 'Parle-G Original Glucose Biscuits 250g',
        type: 'PRODUCT' as const,
        sku: 'BSK-250',
        barcode: '8901719101038',
        category: 'Biscuits',
        unit: 'packet',
        costPrice: 24,
        sellingPrice: 30,
        openingStock: 70,
        trackInventory: true,
        lowStockThreshold: 15,
        notes: 'Classic tea-time biscuits with revised MRPs.',
        isActive: true,
        batches: [
          {
            id: 'b-pg-old',
            batchNumber: 'LOT-OLD-28',
            expiryDate: '2026-10-10',
            mrp: 28,
            costPrice: 22,
            stockQuantity: 20,
          },
          {
            id: 'b-pg-new',
            batchNumber: 'LOT-NEW-30',
            expiryDate: '2027-03-31',
            mrp: 30,
            costPrice: 24,
            stockQuantity: 50,
          },
        ],
      },
      {
        name: 'Surf Excel Easy Wash Detergent Powder 1kg',
        type: 'PRODUCT' as const,
        sku: 'DET-001',
        barcode: '8901030705006',
        category: 'Household',
        unit: 'packet',
        costPrice: 115,
        sellingPrice: 140,
        openingStock: 30,
        trackInventory: true,
        lowStockThreshold: 6,
        notes: 'Fast stain removal detergent.',
        isActive: true,
      },
      {
        name: 'Brooke Bond Red Label Strong Tea 500g',
        type: 'PRODUCT' as const,
        sku: 'TEA-500',
        barcode: '8901030018151',
        category: 'Beverages',
        unit: 'box',
        costPrice: 220,
        sellingPrice: 260,
        openingStock: 20,
        trackInventory: true,
        lowStockThreshold: 5,
        notes: 'Rich taste and flavor.',
        isActive: true,
      },
      {
        name: 'Dettol Original Bathing Soap 75g (Pack of 3)',
        type: 'PRODUCT' as const,
        sku: 'DET-S03',
        barcode: '8901396112003',
        category: 'Personal Care',
        unit: 'pack',
        costPrice: 110,
        sellingPrice: 135,
        openingStock: 35,
        trackInventory: true,
        lowStockThreshold: 8,
        notes: 'Germ protection bar soap.',
        isActive: true,
      },
    ];

    const existingItems = await itemRepository.getItems(businessId);
    const createdItems = [];
    for (const itemDef of sampleItemDefs) {
      const match = existingItems.find(
        (ei) =>
          (itemDef.sku && ei.sku === itemDef.sku) ||
          ei.name.toLowerCase() === itemDef.name.toLowerCase()
      );
      if (match) {
        await itemRepository.updateItem(match.id, itemDef);
        createdItems.push({ ...match, ...itemDef });
      } else {
        const created = await itemRepository.createItem(businessId, itemDef);
        createdItems.push(created);
      }
    }

    // 5. Create Sample Inbound Purchase Transactions
    let purchasesCount = 0;
    if (createdSuppliers.length > 0 && createdItems.length >= 4) {
      // Purchase 1: FMCG restock from Metro Wholesale (Paid from Bank)
      await purchaseService.completePurchase(businessId, {
        supplierId: createdSuppliers[0].id,
        supplierNameSnapshot: createdSuppliers[0].name,
        purchaseDate: new Date(Date.now() - 3 * 86400000).toISOString(),
        lines: [
          {
            itemId: createdItems[1].id, // Atta
            itemNameSnapshot: createdItems[1].name,
            quantity: 10,
            unit: createdItems[1].unit,
            unitCost: createdItems[1].costPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
          {
            itemId: createdItems[2].id, // Oil
            itemNameSnapshot: createdItems[2].name,
            quantity: 15,
            unit: createdItems[2].unit,
            unitCost: createdItems[2].costPrice,
            discountType: 'PERCENTAGE',
            discountValue: 5,
            discountAmount: 93.75,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 4531.25,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 4531.25,
        paidAmount: 4531.25,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAccount?.id,
        notes: 'Monthly bulk FMCG restocking order',
      });
      purchasesCount++;

      // Purchase 2: Dairy restock from Amul Dairy Agency (Paid from Cash)
      await purchaseService.completePurchase(businessId, {
        supplierId: createdSuppliers[1].id,
        supplierNameSnapshot: createdSuppliers[1].name,
        purchaseDate: new Date(Date.now() - 1 * 86400000).toISOString(),
        lines: [
          {
            itemId: createdItems[0].id, // Milk
            itemNameSnapshot: createdItems[0].name,
            quantity: 20,
            unit: createdItems[0].unit,
            unitCost: createdItems[0].costPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 1300,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1300,
        paidAmount: 1300,
        paymentMethod: 'CASH',
        financialAccountId: cashAccount?.id,
        notes: 'Daily milk crate delivery',
      });
      purchasesCount++;
    }

    // 6. Create Sample Outbound Sales Transactions
    let salesCount = 0;
    if (createdItems.length >= 6) {
      // Sale 1: Fast Cash Sale (Milk, Maggi, Parle-G)
      await saleService.completeSale(businessId, {
        customerNameSnapshot: 'Walk-in Customer',
        saleDate: new Date(Date.now() - 2 * 86400000).toISOString(),
        lines: [
          {
            itemId: createdItems[0].id, // Milk
            itemNameSnapshot: createdItems[0].name,
            quantity: 2,
            unit: createdItems[0].unit,
            rate: createdItems[0].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
          {
            itemId: createdItems[5].id, // Maggi
            itemNameSnapshot: createdItems[5].name,
            quantity: 2,
            unit: createdItems[5].unit,
            rate: createdItems[5].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
          {
            itemId: createdItems[6].id, // Parle-G
            itemNameSnapshot: createdItems[6].name,
            quantity: 1,
            unit: createdItems[6].unit,
            rate: createdItems[6].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 290,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 290,
        paidAmount: 290,
        paymentMethod: 'CASH',
        financialAccountId: cashAccount?.id,
        notes: 'Morning walk-in counter sale',
      });
      salesCount++;

      // Sale 2: Khata / Credit Sale for Ramesh Kumar Sharma (Atta, Oil, Salt)
      await saleService.completeSale(businessId, {
        customerId: createdCustomers[0]?.id,
        customerNameSnapshot: createdCustomers[0]?.name || 'Ramesh Kumar Sharma',
        saleDate: new Date(Date.now() - 1 * 86400000).toISOString(),
        lines: [
          {
            itemId: createdItems[1].id, // Atta
            itemNameSnapshot: createdItems[1].name,
            quantity: 1,
            unit: createdItems[1].unit,
            rate: createdItems[1].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
          {
            itemId: createdItems[2].id, // Oil
            itemNameSnapshot: createdItems[2].name,
            quantity: 2,
            unit: createdItems[2].unit,
            rate: createdItems[2].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
          {
            itemId: createdItems[3].id, // Salt
            itemNameSnapshot: createdItems[3].name,
            quantity: 1,
            unit: createdItems[3].unit,
            rate: createdItems[3].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 638,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 638,
        paidAmount: 0, // Unpaid / Khata
        paymentMethod: 'CASH',
        financialAccountId: cashAccount?.id,
        notes: 'Monthly provisions billed to Khata',
      });
      salesCount++;

      // Sale 3: UPI Sale with Bill Discount for Priya Patel (Tea, Chocolate, Soap)
      await saleService.completeSale(businessId, {
        customerId: createdCustomers[1]?.id,
        customerNameSnapshot: createdCustomers[1]?.name || 'Priya Patel',
        saleDate: new Date().toISOString(),
        lines: [
          {
            itemId: createdItems[8].id, // Tea
            itemNameSnapshot: createdItems[8].name,
            quantity: 1,
            unit: createdItems[8].unit,
            rate: createdItems[8].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
          {
            itemId: createdItems[4].id, // Chocolate
            itemNameSnapshot: createdItems[4].name,
            quantity: 2,
            unit: createdItems[4].unit,
            rate: createdItems[4].sellingPrice,
            discountType: 'PERCENTAGE',
            discountValue: 10,
            discountAmount: 18,
            taxAmount: 0,
            trackInventory: true,
          },
          {
            itemId: createdItems[9].id, // Soap
            itemNameSnapshot: createdItems[9].name,
            quantity: 1,
            unit: createdItems[9].unit,
            rate: createdItems[9].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 557,
        discountType: 'FLAT',
        discountValue: 27,
        discountAmount: 27,
        taxAmount: 0,
        totalAmount: 530,
        paidAmount: 530,
        paymentMethod: 'UPI',
        financialAccountId: bankAccount?.id,
        notes: 'Paid via GPay UPI QR',
      });
      salesCount++;

      // Sale 4: Partial Payment Sale for Amit Verma
      await saleService.completeSale(businessId, {
        customerId: createdCustomers[2]?.id,
        customerNameSnapshot: createdCustomers[2]?.name || 'Amit Verma',
        saleDate: new Date().toISOString(),
        lines: [
          {
            itemId: createdItems[7].id, // Surf Excel
            itemNameSnapshot: createdItems[7].name,
            quantity: 2,
            unit: createdItems[7].unit,
            rate: createdItems[7].sellingPrice,
            discountType: 'NONE',
            discountValue: 0,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 280,
        discountType: 'NONE',
        discountValue: 0,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 280,
        paidAmount: 100, // ₹100 paid now, ₹180 on Khata
        paymentMethod: 'CASH',
        financialAccountId: cashAccount?.id,
        notes: 'Partial cash payment, balance to Khata',
      });
      salesCount++;
    }

    // 7. Record a Customer Khata payment (Ramesh pays ₹200 towards his outstanding)
    if (createdCustomers[0]) {
      await paymentService.receiveCustomerPayment({
        businessId,
        customerId: createdCustomers[0].id,
        amount: 200,
        paymentDate: new Date().toISOString(),
        paymentMethod: 'CASH',
        financialAccountId: cashAccount?.id,
        notes: 'Partial payment against Khata balance',
      });
    }

    return {
      itemsCount: createdItems.length,
      customersCount: createdCustomers.length,
      suppliersCount: createdSuppliers.length,
      purchasesCount,
      salesCount,
    };
  },

  /**
   * Clears all transactional and inventory data (Items, Customers, Suppliers, Sales, Purchases, Expenses)
   * for the given business while preserving the business store profile, allowing a completely fresh start.
   */
  async clearBusinessData(businessId: string): Promise<void> {
    await db.transaction(
      'rw',
      [
        db.items,
        db.customers,
        db.suppliers,
        db.sales,
        db.saleLines,
        db.purchases,
        db.purchaseLines,
        db.stockMovements,
        db.payments,
        db.supplierPayments,
        db.paymentAllocations,
        db.supplierPaymentAllocations,
        db.saleReturns,
        db.saleReturnLines,
        db.purchaseReturns,
        db.purchaseReturnLines,
        db.saleVoids,
        db.purchaseVoids,
        db.refunds,
        db.refundsReceived,
        db.paymentReversals,
        db.supplierPaymentReversals,
        db.expenses,
        db.expenseReversals,
        db.accountTransfers,
        db.accountTransferReversals,
        db.financialMovements,
        db.syncMetadata,
      ],
      async () => {
        const [items, customers, suppliers, sales, purchases] = await Promise.all([
          db.items.where('businessId').equals(businessId).toArray(),
          db.customers.where('businessId').equals(businessId).toArray(),
          db.suppliers.where('businessId').equals(businessId).toArray(),
          db.sales.where('businessId').equals(businessId).toArray(),
          db.purchases.where('businessId').equals(businessId).toArray(),
        ]);

        const recordIds = [
          ...items.map((i) => i.id),
          ...customers.map((c) => c.id),
          ...suppliers.map((s) => s.id),
          ...sales.map((s) => s.id),
          ...purchases.map((p) => p.id),
        ];

        if (recordIds.length > 0) {
          await db.syncMetadata.where('recordId').anyOf(recordIds).delete();
        }

        await Promise.all([
          db.items.where('businessId').equals(businessId).delete(),
          db.customers.where('businessId').equals(businessId).delete(),
          db.suppliers.where('businessId').equals(businessId).delete(),
          db.sales.where('businessId').equals(businessId).delete(),
          db.saleLines.where('businessId').equals(businessId).delete(),
          db.purchases.where('businessId').equals(businessId).delete(),
          db.purchaseLines.where('businessId').equals(businessId).delete(),
          db.stockMovements.where('businessId').equals(businessId).delete(),
          db.payments.where('businessId').equals(businessId).delete(),
          db.supplierPayments.where('businessId').equals(businessId).delete(),
          db.paymentAllocations.where('businessId').equals(businessId).delete(),
          db.supplierPaymentAllocations.where('businessId').equals(businessId).delete(),
          db.saleReturns.where('businessId').equals(businessId).delete(),
          db.saleReturnLines.where('businessId').equals(businessId).delete(),
          db.purchaseReturns.where('businessId').equals(businessId).delete(),
          db.purchaseReturnLines.where('businessId').equals(businessId).delete(),
          db.saleVoids.where('businessId').equals(businessId).delete(),
          db.purchaseVoids.where('businessId').equals(businessId).delete(),
          db.refunds.where('businessId').equals(businessId).delete(),
          db.refundsReceived.where('businessId').equals(businessId).delete(),
          db.paymentReversals.where('businessId').equals(businessId).delete(),
          db.supplierPaymentReversals.where('businessId').equals(businessId).delete(),
          db.expenses.where('businessId').equals(businessId).delete(),
          db.expenseReversals.where('businessId').equals(businessId).delete(),
          db.accountTransfers.where('businessId').equals(businessId).delete(),
          db.accountTransferReversals.where('businessId').equals(businessId).delete(),
          db.financialMovements.where('businessId').equals(businessId).delete(),
        ]);
      }
    );
  },
};
