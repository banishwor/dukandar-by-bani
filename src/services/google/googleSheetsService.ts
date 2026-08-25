/**
 * Google Sheets API v4 REST Client
 *
 * Scopes:
 * - https://www.googleapis.com/auth/drive.file
 * - https://www.googleapis.com/auth/spreadsheets
 */

import type { GoogleSpreadsheetProperty } from '../../types/google';

export class GoogleSheetsApiError extends Error {
  public statusCode?: number;
  public details?: any;

  constructor(message: string, statusCode?: number, details?: any) {
    super(message);
    this.name = 'GoogleSheetsApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const googleSheetsService = {
  /**
   * Sanitizes business names for safe spreadsheet titles.
   */
  sanitizeTitle(name: string): string {
    const cleaned = (name || 'Business')
      .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || 'Business';
  },

  /**
   * Generates the standard spreadsheet backup title.
   */
  getStandardSpreadsheetTitle(businessName: string): string {
    return `Dukandar by Bani — Backup — ${this.sanitizeTitle(businessName)}`;
  },

  /**
   * Creates a dedicated private Google Spreadsheet for a business backup with README and BackupMeta tabs.
   */
  async createBackupSpreadsheet(
    accessToken: string,
    params: {
      businessId: string;
      businessName: string;
      deviceId: string;
      appVersion?: string;
      schemaVersion?: number;
    }
  ): Promise<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    spreadsheetTitle: string;
  }> {
    const title = this.getStandardSpreadsheetTitle(params.businessName);
    const now = new Date().toISOString();
    const appVersion = params.appVersion || '1.0.0';
    const schemaVersion = params.schemaVersion || 5;

    // 1. Create Spreadsheet with initial tabs
    const createBody = {
      properties: {
        title,
      },
      sheets: [
        {
          properties: {
            title: 'README',
            gridProperties: { rowCount: 30, columnCount: 6 },
          },
        },
        {
          properties: {
            title: 'BackupMeta',
            gridProperties: { rowCount: 30, columnCount: 4 },
          },
        },
      ],
    };

    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to create backup spreadsheet (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }

    const createdSpreadsheet: GoogleSpreadsheetProperty = await res.json();
    const spreadsheetId = createdSpreadsheet.spreadsheetId;
    const spreadsheetUrl =
      createdSpreadsheet.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 2. Initialize README content
    const readmeRows = [
      ['Dukandar by Bani — Private Business Backup Archive'],
      [''],
      ['IMPORTANT INFORMATION:'],
      ['1. This spreadsheet is a private archive of your Dukandar by Bani business records.'],
      ['2. Primary Source of Truth: Your local device database (IndexedDB) is the primary ledger.'],
      ['3. Data Restores: Data is only restored onto a device when you explicitly choose "Restore".'],
      ['4. Live Operations: The mobile/web app does NOT use this spreadsheet as a live database.'],
      [''],
      ['Created At:', now],
      ['Business Name:', params.businessName],
      ['Business ID:', params.businessId],
      ['Device ID:', params.deviceId],
      ['App Version:', appVersion],
    ];

    await this.updateSheetValues(accessToken, spreadsheetId, 'README!A1:B13', readmeRows);

    // 3. Initialize BackupMeta control tab
    const metaRows = [
      ['Field', 'Value'],
      ['businessId', params.businessId],
      ['businessName', params.businessName],
      ['appVersion', appVersion],
      ['schemaVersion', String(schemaVersion)],
      ['backupFormatVersion', '1.0'],
      ['status', 'INITIALIZED_PHASE_7A'],
      ['createdAt', now],
      ['lastBackupAt', ''],
      ['deviceId', params.deviceId],
      ['checksum', ''],
    ];

    await this.updateSheetValues(accessToken, spreadsheetId, 'BackupMeta!A1:B11', metaRows);

    return {
      spreadsheetId,
      spreadsheetUrl,
      spreadsheetTitle: title,
    };
  },

  /**
   * Updates cell values in a specified A1 range.
   */
  async updateSheetValues(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to update sheet values at ${range} (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }
  },

  /**
   * Clears cell values across multiple ranges in a single atomic batchClear request.
   */
  async batchClearValues(
    accessToken: string,
    spreadsheetId: string,
    ranges: string[]
  ): Promise<void> {
    if (!ranges || ranges.length === 0) return;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchClear`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ranges }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to batch clear sheet ranges (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }
  },

  /**
   * Writes values to multiple ranges/sheets in a single batchUpdate request.
   */
  async batchUpdateValues(
    accessToken: string,
    spreadsheetId: string,
    data: Array<{ range: string; majorDimension?: string; values: any[][] }>,
    valueInputOption = 'USER_ENTERED'
  ): Promise<any> {
    if (!data || data.length === 0) return;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`;

    const formattedData = data.map((d) => ({
      range: d.range,
      majorDimension: d.majorDimension || 'ROWS',
      values: d.values,
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption,
        data: formattedData,
      }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to batch update values (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }

    return await res.json();
  },

  /**
   * Clears cell values in a specified A1 range or sheet.
   */
  async clearSheetValues(
    accessToken: string,
    spreadsheetId: string,
    range: string
  ): Promise<void> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}:clear`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to clear sheet values at ${range} (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }
  },

  /**
   * Appends rows to a specified sheet.
   */
  async appendValues(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: any[][]
  ): Promise<void> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to append values to ${range} (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }
  },

  /**
   * Reads values from a specified A1 range.
   */
  async readSheetValues(
    accessToken: string,
    spreadsheetId: string,
    range: string
  ): Promise<any[][]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to read values from ${range} (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }

    const data = await res.json();
    return data.values || [];
  },

  /**
   * Reads multiple ranges/tabs from a spreadsheet in a single atomic batchGet HTTP request.
   */
  async batchGetValues(
    accessToken: string,
    spreadsheetId: string,
    ranges: string[]
  ): Promise<Array<{ range: string; values: any[][] }>> {
    if (!ranges || ranges.length === 0) return [];

    const queryParams = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchGet?${queryParams}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to batch get sheet values (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }

    const data = await res.json();
    return (data.valueRanges || []).map((vr: any) => ({
      range: vr.range || '',
      values: vr.values || [],
    }));
  },

  /**
   * Fetches full spreadsheet metadata including sheet tabs list.
   */
  async getSpreadsheetMetadata(
    accessToken: string,
    spreadsheetId: string
  ): Promise<GoogleSpreadsheetProperty> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,properties.title,spreadsheetUrl,sheets.properties`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to get spreadsheet metadata (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }

    return await res.json();
  },

  /**
   * Executes a batch update request (addSheet, deleteSheet, updateSheetProperties, etc.).
   */
  async batchUpdateSpreadsheet(
    accessToken: string,
    spreadsheetId: string,
    requests: any[]
  ): Promise<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}:batchUpdate`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      throw new GoogleSheetsApiError(
        errorJson?.error?.message || `Failed to batch update spreadsheet (HTTP ${res.status})`,
        res.status,
        errorJson
      );
    }

    return await res.json();
  },

  /**
   * Ensures that all requested tab titles exist in the spreadsheet; creates missing ones in a single batchUpdate.
   */
  async ensureSheetsExist(
    accessToken: string,
    spreadsheetId: string,
    requiredTitles: string[]
  ): Promise<void> {
    const metadata = await this.getSpreadsheetMetadata(accessToken, spreadsheetId);
    const existingTitles = new Set(
      (metadata.sheets || []).map((s) => s.properties.title)
    );

    const missingTitles = requiredTitles.filter((t) => !existingTitles.has(t));
    if (missingTitles.length === 0) return;

    const addSheetRequests = missingTitles.map((title) => ({
      addSheet: {
        properties: {
          title,
          gridProperties: { rowCount: 100, columnCount: 20 },
        },
      },
    }));

    await this.batchUpdateSpreadsheet(accessToken, spreadsheetId, addSheetRequests);
  },

  /**
   * Verifies if a spreadsheet exists and is accessible with current token.
   */
  async verifySpreadsheetAccess(
    accessToken: string,
    spreadsheetId: string
  ): Promise<{
    accessible: boolean;
    title?: string;
    spreadsheetUrl?: string;
    statusCode: number;
    errorMessage?: string;
  }> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}?fields=spreadsheetId,properties.title,spreadsheetUrl`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        return {
          accessible: true,
          title: data.properties?.title,
          spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
          statusCode: res.status,
        };
      }

      const errData = await res.json().catch(() => ({}));
      return {
        accessible: false,
        statusCode: res.status,
        errorMessage: errData?.error?.message || `HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        accessible: false,
        statusCode: 0,
        errorMessage: err?.message || 'Network error while reaching Google Sheets',
      };
    }
  },
};
