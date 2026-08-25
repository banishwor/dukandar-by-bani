# Dukandar by Bani 🏪✨

> **Modern, Ultra-Fast Offline-First Business Management & Accounting PWA for Retailers, Wholesalers, and Small Businesses.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.0+-61dafb.svg)](https://react.dev/)
[![Dexie.js](https://img.shields.io/badge/Dexie.js-IndexedDB-orange.svg)](https://dexie.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646cff.svg)](https://vitejs.dev/)
[![Status: 231 Passing Tests](https://img.shields.io/badge/Tests-231%20Passing-brightgreen.svg)]()

---

## 📖 Overview

**Dukandar by Bani** is a Progressive Web Application (PWA) designed to give shopkeepers and business owners complete financial and operational control with zero internet required. 

Built with an **Offline-First Architecture**, the application treats your local browser's IndexedDB as the **absolute single source of truth**. Every invoice, stock adjustment, payment, and expense is recorded with transactional integrity, immutable audit ledgers, and sub-millisecond local response times.

---

## 🚀 Key Features

### 🛒 Sales & Point-of-Sale (POS)
- **Lightning-Fast Invoicing**: Instant search for products, barcode scanning support, and real-time total computation.
- **Advanced Discount Engine**: Support for item-level and bill-level discounts (both FLAT monetary and PERCENTAGE) with full tax consistency.
- **Flexible Settlement**: Cash, Bank Transfer, UPI, Cheque, or Customer Credit (Khata / Udhar).
- **Returns & Voids**: Full return workflows with automatic inventory restocking and customer credit or cash refund options.

### 📦 Purchases & Supplier Management
- **Purchase Order & Inward Entry**: Record vendor bills with freight, line discounts, and supplier credit tracking.
- **Supplier Khata (Accounts Payable)**: Detailed balance tracking, purchase return debit notes, and payment allocations.

### 💰 Financial Accounts & Double-Entry Ledger
- **Multi-Account Support**: Manage Cash in Hand, Bank Accounts, UPI Wallets, and Petty Cash.
- **Immutable Financial Movements**: Every transaction writes a double-entry ledger movement ensuring mathematical balance reconciliation.
- **Account-to-Account Transfers**: Move funds seamlessly between cash and bank with audit trails.
- **Categorized Expense Tracking**: Log operational expenses, overheads, salaries, and utilities.

### 📊 Inventory & Stock Audit Ledger
- **Real-Time Stock Tracking**: Stock levels auto-adjust on sales, returns, purchases, and manual adjustments.
- **Stock Movement Log**: Full immutable history tracking every quantity change with reason codes.
- **Low Stock Alerts**: Automated warnings when inventory falls below minimum reorder thresholds.

### 📈 Reports & Business Intelligence
- **Sales & Profit Analytics**: Real-time gross sales, net revenue, discounts given, and profit margins.
- **Cash Flow Statements**: Inflow vs outflow breakdown across all accounts.
- **Top Performers**: Best-selling items, high-value customers, and inventory turnover.

---

## ☁️ Google Cloud Backup & Restore (Notice)

> [!WARNING]
> **Experimental / Under Active Development**
> The Google Drive & Google Sheets Backup / Restore feature is currently in active development.
> While the local snapshot serializer and 31-tab schemas are defined, cloud backup and restore functionality is **not enabled or recommended for production use at this time**.
> All local business data remains completely safe and preserved in your browser's IndexedDB.

---

## 🛠️ Technology Stack

- **Frontend Core**: React 18 + TypeScript (Strict Mode)
- **Styling**: Tailwind CSS + Custom Design System tokens
- **Local Storage Engine**: Dexie.js (IndexedDB wrapper with multi-table indexing and relational integrity)
- **State Management & Contexts**: React Context + Custom Domain Hooks
- **Icons**: Lucide React
- **Build Tool**: Vite 6
- **Testing Engine**: Built-in 231-scenario Master Verification Suite

---

## 💻 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/banishwor/dukandar-by-bani.git
cd dukandar-by-bani
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy the example environment configuration:
```bash
cp .env.example .env.local
```
*(Optional: Configure `VITE_GOOGLE_CLIENT_ID` if testing Google OAuth integration).*

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Run Verification Test Suite
To run the complete 231-test master integrity verification suite:
```bash
npm run test:runner
# or
npx tsx src/scripts/testRunner.ts
```

### 6. Build for Production
```bash
npm run build
```

---

## 🔒 Security & Privacy

- **Zero Cloud Leakage**: Your customers, prices, profit margins, and transactions are stored solely on your device.
- **Zero Client Secrets**: No API secrets or private keys are bundled into client-side JavaScript.
- **Sandboxed Execution**: Backups operate strictly on user-consented, private Google Drive files without accessing external files.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
