import {
  cachePromotionEntitlement, getCachedPromotionEntitlement, hydratePromotionEntitlementCache,
  resetPromotionEntitlementCacheForTests, subscribeCachedPromotionEntitlement,
} from '../entitlementCache'

const mockGet = jest.fn<Promise<string | null>, [string]>()
const mockSet = jest.fn<Promise<void>, [string, string]>()
let mockDisk: string | null = null
jest.mock('expo-sqlite/kv-store', () => ({ __esModule: true, default: {
  getItem: (key: string) => mockGet(key), setItem: (key: string, value: string) => mockSet(key, value),
} }))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => { resolve = finish })
  return { promise, resolve }
}
beforeEach(() => {
  resetPromotionEntitlementCacheForTests(); mockDisk = null
  mockGet.mockReset().mockImplementation(async () => mockDisk)
  mockSet.mockReset().mockImplementation(async (_key, value) => { mockDisk = value })
})

it('keeps the newest ownership result durable when the earlier save is slow', async () => {
  const firstWrite = deferred<void>()
  mockSet.mockImplementationOnce(async (_key, value) => { await firstWrite.promise; mockDisk = value })
  const first = cachePromotionEntitlement({ owned: false, status: 'not_owned' })
  const second = cachePromotionEntitlement({ owned: true, status: 'owned' })
  await Promise.resolve(); await Promise.resolve()
  try { expect(mockSet).toHaveBeenCalledTimes(1) } finally { firstWrite.resolve() }
  await Promise.all([first, second])
  expect(JSON.parse(mockDisk!).owned).toBe(true)
  resetPromotionEntitlementCacheForTests(); await hydratePromotionEntitlementCache()
  expect(getCachedPromotionEntitlement().owned).toBe(true)
})

it.each(['unknown', 'pending'] as const)('preserves confirmed ownership through a %s result', async (status) => {
  await cachePromotionEntitlement({ owned: true, status: 'owned' })
  const saved = mockDisk, timestamp = getCachedPromotionEntitlement().updatedAtEpochMs
  await cachePromotionEntitlement({ owned: false, status })
  expect(getCachedPromotionEntitlement()).toMatchObject({ owned: true, status: 'owned', updatedAtEpochMs: timestamp })
  expect(mockDisk).toBe(saved)
})

it('hydrates earlier confirmed ownership before considering an uncertain result', async () => {
  mockDisk = JSON.stringify({ owned: true, status: 'owned', updatedAtEpochMs: 123 })
  await cachePromotionEntitlement({ owned: false, status: 'unknown' })
  expect(getCachedPromotionEntitlement()).toMatchObject({ owned: true, status: 'owned', updatedAtEpochMs: 123 })
  expect(mockSet).not.toHaveBeenCalled()
})

it('keeps a failed-read durable record untouched when the store is also uncertain', async () => {
  mockDisk = JSON.stringify({ owned: true, status: 'owned', updatedAtEpochMs: 123 })
  mockGet.mockRejectedValueOnce(new Error('Storage temporarily unavailable'))
  await cachePromotionEntitlement({ owned: false, status: 'unknown' })
  expect(mockSet).not.toHaveBeenCalled()
  expect(JSON.parse(mockDisk!).owned).toBe(true)
})

it('contains a synchronous cache bridge failure without erasing durable ownership', async () => {
  mockDisk = JSON.stringify({ owned: true, status: 'owned', updatedAtEpochMs: 123 })
  mockGet.mockImplementationOnce(() => { throw new Error('Native storage unavailable') })
  await expect(hydratePromotionEntitlementCache()).resolves.toBeUndefined()
  expect(getCachedPromotionEntitlement()).toMatchObject({ hydrated: true, status: 'unknown', owned: false })
  expect(mockSet).not.toHaveBeenCalled()
  expect(JSON.parse(mockDisk!).owned).toBe(true)
})

it('accepts an explicit known revocation and restores it after relaunch', async () => {
  await cachePromotionEntitlement({ owned: true, status: 'owned' })
  await cachePromotionEntitlement({ owned: false, status: 'not_owned' })
  resetPromotionEntitlementCacheForTests(); await hydratePromotionEntitlementCache()
  expect(getCachedPromotionEntitlement()).toMatchObject({ owned: false, status: 'not_owned' })
})

it('does not let a late local hydration replace a newly confirmed store result', async () => {
  const oldRead = deferred<string | null>()
  mockGet.mockReturnValueOnce(oldRead.promise)
  const hydration = hydratePromotionEntitlementCache()
  await cachePromotionEntitlement({ owned: true, status: 'owned' })
  oldRead.resolve(JSON.stringify({ owned: false, status: 'not_owned', updatedAtEpochMs: 1 }))
  await hydration
  expect(getCachedPromotionEntitlement()).toMatchObject({ owned: true, status: 'owned' })
})

it.each([null, 123])('retains compatible v1 ownership with timestamp %j', async (updatedAtEpochMs) => {
  mockDisk = JSON.stringify({ owned: true, status: 'owned', updatedAtEpochMs })
  await hydratePromotionEntitlementCache()
  expect(getCachedPromotionEntitlement()).toMatchObject({ owned: true, status: 'owned', hydrated: true })
})

it.each([
  { owned: true, status: 'not_owned', updatedAtEpochMs: 123 },
  { owned: false, status: 'owned', updatedAtEpochMs: 123 },
  { owned: true, status: 'owned', updatedAtEpochMs: -1 },
  { owned: true, status: 'owned', updatedAtEpochMs: 'invalid' },
])('rejects inconsistent stored ownership without granting a benefit: %j', async (value) => {
  mockDisk = JSON.stringify(value); await hydratePromotionEntitlementCache()
  expect(getCachedPromotionEntitlement()).toMatchObject({ owned: false, status: 'unknown', hydrated: true })
})

it('isolates a broken subscriber so the result still reaches storage and other screens', async () => {
  const nextScreen = jest.fn()
  subscribeCachedPromotionEntitlement(() => { throw new Error('Obsolete observer') })
  subscribeCachedPromotionEntitlement(nextScreen)
  await expect(cachePromotionEntitlement({ owned: true, status: 'owned' })).resolves.toBe('saved')
  expect(nextScreen).toHaveBeenCalledTimes(1)
  expect(JSON.parse(mockDisk!).owned).toBe(true)
})

it('reports a failed offline save without losing current ownership or poisoning the next save', async () => {
  mockSet.mockRejectedValueOnce(new Error('No storage space'))
  await expect(cachePromotionEntitlement({ owned: true, status: 'owned' })).resolves.toBe('not-saved')
  expect(getCachedPromotionEntitlement().owned).toBe(true)
  await expect(cachePromotionEntitlement({ owned: true, status: 'owned' })).resolves.toBe('saved')
  expect(JSON.parse(mockDisk!).owned).toBe(true)
})
