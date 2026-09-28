import { db } from '../db/database';
import type {
  CashDrawerSession,
  CloseCashDrawerPayload,
  FinancialMovement,
  SyncMetadata,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency } from '../utils/money';

/**
 * Cash Drawer / Galla Repository
 *
 * IMMUTABILITY RULE:
 * Cash Drawer Sessions are append-only audit records of physical register tallies.
 * They represent point-in-time reconciliations between system cash ledgers and physical cash.
 */
export const cashDrawerRepository = {
  async getSessions(businessId: string): Promise<CashDrawerSession[]> {
    return await db.cashDrawerSessions
      .where('businessId')
      .equals(businessId)
      .filter((s) => !s.isDeleted)
      .reverse()
      .sortBy('sessionDate');
  },

  async getSessionById(id: string): Promise<CashDrawerSession | undefined> {
    return await db.cashDrawerSessions.get(id);
  },

  async getLastClosedSession(
    businessId: string,
    financialAccountId: string
  ): Promise<CashDrawerSession | undefined> {
    const sessions = await db.cashDrawerSessions
      .where('businessId')
      .equals(businessId)
      .filter(
        (s) =>
          !s.isDeleted &&
          s.financialAccountId === financialAccountId
      )
      .reverse()
      .sortBy('closedAt');

    return sessions.length > 0 ? sessions[0] : undefined;
  },

  async getTodaySession(
    businessId: string,
    financialAccountId: string,
    sessionDate: string
  ): Promise<CashDrawerSession | undefined> {
    const sessions = await db.cashDrawerSessions
      .where('businessId')
      .equals(businessId)
      .filter(
        (s) =>
          !s.isDeleted &&
          s.financialAccountId === financialAccountId &&
          s.sessionDate === sessionDate
      )
      .reverse()
      .sortBy('closedAt');

    return sessions.length > 0 ? sessions[0] : undefined;
  },

  async createSession(
    payload: CloseCashDrawerPayload
  ): Promise<{ session: CashDrawerSession; movement?: FinancialMovement; isUpdate: boolean }> {
    const now = new Date().toISOString();
    const deviceId = getPersistentDeviceId();

    // Check if a session already exists today for this account (one-per-day rule)
    const existingSession = await this.getTodaySession(
      payload.businessId,
      payload.financialAccountId,
      payload.sessionDate
    );

    let adjustingMovement: FinancialMovement | undefined;

    if (existingSession) {
      // Overwrite / Update today's existing session
      const updatedSession: CashDrawerSession = {
        ...existingSession,
        openedAt: existingSession.openedAt || payload.openedAt || now,
        closedAt: payload.closedAt || now,
        openingFloat: roundCurrency(existingSession.openingFloat ?? payload.openingFloat),
        cashSales: roundCurrency(payload.cashSales),
        cashCustomerPayments: roundCurrency(payload.cashCustomerPayments),
        cashExpenses: roundCurrency(payload.cashExpenses),
        cashSupplierPayments: roundCurrency(payload.cashSupplierPayments),
        cashRefunds: roundCurrency(payload.cashRefunds),
        cashTransfersIn: roundCurrency(payload.cashTransfersIn),
        cashTransfersOut: roundCurrency(payload.cashTransfersOut),
        totalCashIn: roundCurrency(payload.totalCashIn),
        totalCashOut: roundCurrency(payload.totalCashOut),
        expectedCash: roundCurrency(payload.expectedCash),
        countedCash: roundCurrency(payload.countedCash),
        difference: roundCurrency(payload.difference),
        denominations: payload.denominations,
        takeHomeCash: payload.takeHomeCash !== undefined ? roundCurrency(payload.takeHomeCash) : undefined,
        nextDayFloat: payload.nextDayFloat !== undefined ? roundCurrency(payload.nextDayFloat) : undefined,
        notes: payload.notes?.trim() || undefined,
        isReconciledLedger: Boolean(payload.reconcileWithMovement && payload.difference !== 0),
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: (existingSession.version || 1) + 1,
      };

      await db.transaction(
        'rw',
        [db.cashDrawerSessions, db.financialMovements, db.syncMetadata],
        async () => {
          await db.cashDrawerSessions.put(updatedSession);

          // Update sync metadata
          const syncMeta = await db.syncMetadata
            .where('recordId')
            .equals(existingSession.id)
            .first();
          if (syncMeta) {
            await db.syncMetadata.update(syncMeta.id, {
              syncState: 'LOCAL_ONLY',
              updatedAt: now,
              version: updatedSession.version,
            });
          }

          // Clean up prior discrepancy adjustment movement if one was created
          const oldMovements = await db.financialMovements
            .where('referenceId')
            .equals(existingSession.id)
            .filter((m) => m.referenceType === 'GALLA_CLOSE')
            .toArray();

          for (const m of oldMovements) {
            await db.financialMovements.update(m.id, {
              isDeleted: true,
              version: (m.version || 1) + 1,
            });
          }

          // If reconcile requested and discrepancy != 0, create updated adjustment movement
          if (payload.reconcileWithMovement && payload.difference !== 0) {
            const diffAmt = roundCurrency(Math.abs(payload.difference));
            const isSurplus = payload.difference > 0;

            adjustingMovement = {
              id: generateUniqueId('FMOV'),
              businessId: payload.businessId,
              accountId: payload.financialAccountId,
              type: 'ADJUSTMENT',
              direction: isSurplus ? 'IN' : 'OUT',
              amount: diffAmt,
              movementDate: now,
              referenceType: 'GALLA_CLOSE',
              referenceId: existingSession.id,
              description: isSurplus
                ? `Galla cash surplus adjustment (${existingSession.sessionNumber})`
                : `Galla cash shortage adjustment (${existingSession.sessionNumber})`,
              createdAt: now,
              createdByDeviceId: deviceId,
              version: 1,
              isDeleted: false,
            };

            await db.financialMovements.add(adjustingMovement);

            await db.syncMetadata.add({
              id: generateUniqueId('SYNC'),
              recordId: adjustingMovement.id,
              recordType: 'financialMovement',
              syncState: 'LOCAL_ONLY',
              lastSyncedVersion: 0,
              updatedAt: now,
              version: 1,
            });
          }
        }
      );

      return { session: updatedSession, movement: adjustingMovement, isUpdate: true };
    }

    // New session for today
    const sessionId = generateUniqueId('GALLA');
    const cleanDate = (payload.sessionDate || now.slice(0, 10)).replace(/-/g, '');
    const sessionNumber = `GALLA-${cleanDate}`;

    const newSession: CashDrawerSession = {
      id: sessionId,
      businessId: payload.businessId,
      sessionNumber,
      sessionDate: payload.sessionDate,
      openedAt: payload.openedAt || now,
      closedAt: payload.closedAt || now,
      financialAccountId: payload.financialAccountId,
      openingFloat: roundCurrency(payload.openingFloat),
      cashSales: roundCurrency(payload.cashSales),
      cashCustomerPayments: roundCurrency(payload.cashCustomerPayments),
      cashExpenses: roundCurrency(payload.cashExpenses),
      cashSupplierPayments: roundCurrency(payload.cashSupplierPayments),
      cashRefunds: roundCurrency(payload.cashRefunds),
      cashTransfersIn: roundCurrency(payload.cashTransfersIn),
      cashTransfersOut: roundCurrency(payload.cashTransfersOut),
      totalCashIn: roundCurrency(payload.totalCashIn),
      totalCashOut: roundCurrency(payload.totalCashOut),
      expectedCash: roundCurrency(payload.expectedCash),
      countedCash: roundCurrency(payload.countedCash),
      difference: roundCurrency(payload.difference),
      denominations: payload.denominations,
      takeHomeCash: payload.takeHomeCash !== undefined ? roundCurrency(payload.takeHomeCash) : undefined,
      nextDayFloat: payload.nextDayFloat !== undefined ? roundCurrency(payload.nextDayFloat) : undefined,
      notes: payload.notes?.trim() || undefined,
      isReconciledLedger: Boolean(payload.reconcileWithMovement && payload.difference !== 0),
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction(
      'rw',
      [db.cashDrawerSessions, db.financialMovements, db.syncMetadata],
      async () => {
        await db.cashDrawerSessions.add(newSession);

        await db.syncMetadata.add({
          id: generateUniqueId('SYNC'),
          recordId: newSession.id,
          recordType: 'cashDrawerSession' as any,
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        });

        // If user requested to record an adjustment movement to synchronize the financial ledger
        if (payload.reconcileWithMovement && payload.difference !== 0) {
          const diffAmt = roundCurrency(Math.abs(payload.difference));
          const isSurplus = payload.difference > 0;

          adjustingMovement = {
            id: generateUniqueId('FMOV'),
            businessId: payload.businessId,
            accountId: payload.financialAccountId,
            type: 'ADJUSTMENT',
            direction: isSurplus ? 'IN' : 'OUT',
            amount: diffAmt,
            movementDate: now,
            referenceType: 'GALLA_CLOSE',
            referenceId: newSession.id,
            description: isSurplus
              ? `Galla cash surplus adjustment (${sessionNumber})`
              : `Galla cash shortage adjustment (${sessionNumber})`,
            createdAt: now,
            createdByDeviceId: deviceId,
            version: 1,
            isDeleted: false,
          };

          await db.financialMovements.add(adjustingMovement);

          await db.syncMetadata.add({
            id: generateUniqueId('SYNC'),
            recordId: adjustingMovement.id,
            recordType: 'financialMovement',
            syncState: 'LOCAL_ONLY',
            lastSyncedVersion: 0,
            updatedAt: now,
            version: 1,
          });
        }
      }
    );

    return { session: newSession, movement: adjustingMovement, isUpdate: false };
  },
};
