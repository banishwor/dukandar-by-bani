export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataIntegrityError';
  }
}

/**
 * Validates the current version of an existing record and computes the deterministic next version.
 * Throws a DataIntegrityError if the version is missing, non-integer, or < 1.
 */
export function getNextRecordVersion(record: { id?: string; version?: number }, recordName = 'Record'): number {
  if (
    record.version === undefined ||
    record.version === null ||
    typeof record.version !== 'number' ||
    !Number.isInteger(record.version) ||
    record.version < 1
  ) {
    throw new DataIntegrityError(
      `Data integrity violation: ${recordName} with ID '${record.id || 'unknown'}' has an invalid or missing version (${record.version}). Expected a positive integer >= 1.`
    );
  }
  return record.version + 1;
}

/**
 * Asserts that a record has a valid version of at least 1.
 */
export function assertValidVersion(record: { id?: string; version?: number }, recordName = 'Record'): void {
  if (
    record.version === undefined ||
    record.version === null ||
    typeof record.version !== 'number' ||
    !Number.isInteger(record.version) ||
    record.version < 1
  ) {
    throw new DataIntegrityError(
      `Data integrity violation: ${recordName} with ID '${record.id || 'unknown'}' has an invalid version (${record.version}). Expected a positive integer >= 1.`
    );
  }
}
