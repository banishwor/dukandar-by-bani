/**
 * Google Backup & Identity Types
 *
 * Scopes:
 * - https://www.googleapis.com/auth/drive.file (Access strictly limited to files created or opened by this app)
 * - https://www.googleapis.com/auth/spreadsheets (Google Sheets API v4 access for backup sheets)
 * - https://www.googleapis.com/auth/userinfo.email (Safe display of connected Google account)
 */

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email?: boolean;
}

export interface GoogleBackupMetadata {
  businessId: string;
  isConnected: boolean;
  spreadsheetId?: string;
  spreadsheetName?: string;
  spreadsheetUrl?: string;
  userEmail?: string;
  connectedAt?: string;
  lastVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleSpreadsheetProperty {
  spreadsheetId: string;
  properties: {
    title: string;
  };
  spreadsheetUrl: string;
  sheets?: Array<{
    properties: {
      sheetId: number;
      title: string;
      gridProperties?: {
        rowCount: number;
        columnCount: number;
      };
    };
  }>;
}

export interface GoogleAuthStatus {
  isScriptLoaded: boolean;
  hasToken: boolean;
  userEmail?: string;
  error?: string;
}
