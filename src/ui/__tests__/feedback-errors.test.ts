import { operationErrorKey, taskRetryKey } from '../feedback'

describe('storage contention feedback', () => {
  it('describes a committed restore before classifying its underlying storage error', () => {
    const detail = 'RESTORE_COMMITTED_RELOAD_REQUIRED: SQLITE_BUSY while reading backup metadata'
    expect(operationErrorKey(detail)).toBe('backup.reopenHelp'); expect(taskRetryKey(detail)).toBe('backup.reopenLibrary')
    expect(operationErrorKey('RESTORE_COMMITTED_RELOAD_REQUIRED_OTHER')).toBe('common.errorHelp')
    expect(taskRetryKey('STALE_REVISION')).toBe('error.review'); expect(taskRetryKey('Invalid ZIP')).toBe('common.retry')
  })
  it.each([
    'SQLITE_BUSY: database is locked',
    'SQLITE_BUSY_SNAPSHOT',
    'SQLiteException: error code 6 (SQLITE_LOCKED)',
    'SQLITE_LOCKED_SHAREDCACHE',
    "Call to function 'NativeStatement.finalizeAsync' has been rejected. Caused by: database is locked",
    'database table is locked: library_preferences',
    'database schema is locked: main',
    'Database is busy',
    'Backup failed: SQLITE_BUSY_TIMEOUT',
  ])('offers wait-and-retry guidance for %s', (error) => {
    expect(operationErrorKey(error)).toBe('error.databaseBusy')
  })

  it.each([
    ['DOWNLOAD_BUSY', 'error.downloadBusy'],
    ['The screen is locked', 'common.errorHelp'],
    ['The controller is busy', 'common.errorHelp'],
    ['SQLITE_CORRUPT: database disk image is malformed', 'common.errorHelp'],
    ['Backup checksum mismatch', 'error.backupInvalid'],
    ['ENOSPC: no space left on device', 'error.lowStorage'],
    ['SQLITE_BUSYNESS', 'common.errorHelp'],
  ])('does not mistake %s for a temporary database lock', (error, expected) => {
    expect(operationErrorKey(error)).toBe(expected)
  })
})
