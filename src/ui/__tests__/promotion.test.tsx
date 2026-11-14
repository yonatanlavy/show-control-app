import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native'
import { AppState, type AppStateStatus } from 'react-native'
import { I18nProvider, messages } from '../../i18n'
import Storage from 'expo-sqlite/kv-store'
import { CachedPromotionSlot, EntitlementGatedPromotionSlot } from '../../promotions/CachedPromotionSlot'
import {
  cachePromotionEntitlement,
  getCachedPromotionEntitlement,
  resetPromotionEntitlementCacheForTests,
} from '../../promotions/entitlementCache'
import {
  IdlePromotionSlot,
  PromotionPurchasePanel,
  refreshIdleEntitlement,
  setIdleCommerceGatewayForTests,
} from '../../promotions/IdlePromotionCommerce'
import { PROMOTION_SLOT_HEIGHT, PromotionSlot } from '../PromotionSlot'
import { setCriticalSessionActive } from '../../runtime/critical-session-gate'
import { isCriticalShowSession, ShowSession } from '../../runtime'
import { sampleControllerProfiles, sampleShow } from '../../domain'

const mockStorageValues = new Map<string, string>()
let mockFocused = true
jest.mock('expo-router', () => ({
  useFocusEffect: function useFocusEffect(effect: () => void | (() => void)) {
    const React = jest.requireActual<typeof import('react')>('react')
    const focused = mockFocused
    React.useEffect(() => focused ? effect() : undefined, [effect, focused])
  },
}))
const mockCommerce = {
  product: jest.fn(),
  currentEntitlement: jest.fn(),
  purchase: jest.fn(),
  restore: jest.fn(),
  addEntitlementListener: jest.fn(),
  completeDelivery: jest.fn(),
}

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorageValues.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => { mockStorageValues.set(key, value); return Promise.resolve() }),
  },
}))

const notOwned = {
  productId: 'remove_promotions', owned: false, status: 'not_owned', verification: 'storekit_verified', source: 'app_store', detail: '',
} as const
const owned = { ...notOwned, owned: true, status: 'owned' as const }
const product = {
  productId: 'remove_promotions', title: 'Remove promotions', description: 'Store description', displayPrice: '₪9.90', source: 'app_store',
} as const

describe('first-party promotion placement', () => {
  beforeEach(() => {
    mockFocused = true
    setCriticalSessionActive(false)
    resetPromotionEntitlementCacheForTests()
    mockStorageValues.clear()
    jest.clearAllMocks()
    mockCommerce.product.mockResolvedValue(product)
    mockCommerce.currentEntitlement.mockResolvedValue(notOwned)
    mockCommerce.purchase.mockResolvedValue({ ...owned, outcome: 'purchased' })
    mockCommerce.restore.mockResolvedValue(owned)
    mockCommerce.completeDelivery.mockResolvedValue(undefined)
    setIdleCommerceGatewayForTests(mockCommerce)
  })

  afterEach(() => { cleanup(); setCriticalSessionActive(false) })

  it('renders a fixed-size, clearly labelled bundled placement', () => {
    const screen = render(<I18nProvider><PromotionSlot surface="library" /></I18nProvider>)
    expect(screen.getByTestId('first-party-promotion:library')).toBeOnTheScreen()
    expect(screen.getByText(messages.en['promo.label'])).toBeOnTheScreen()
    expect(screen.getByText(messages.en['promo.title'])).toBeOnTheScreen()
    expect(screen.getByTestId('first-party-promotion:library')).toHaveStyle({ height: PROMOTION_SLOT_HEIGHT })
  })

  it('has complete English and Hebrew disclosure copy', () => {
    const keys = ['promo.label', 'promo.title', 'promo.body', 'promo.liveRule'] as const
    for (const key of keys) {
      expect(messages.en[key].trim()).not.toBe('')
      expect(messages.he[key].trim()).not.toBe('')
    }
  })

  it.each(['index', 'builder', 'rehearsal', 'preflight', 'controllers', 'settings'] as const)('keeps the %s route free of promotional placements and purchase controls', (route) => {
    const source = readFileSync(join(process.cwd(), 'app', `${route}.tsx`), 'utf8')
    expect(source).not.toMatch(/promotions\/|show-commerce|PromotionSlot|PromotionPurchasePanel/)
    expect(source).not.toMatch(/\b(?:promotion|commerceControls)\s*=/)
  })

  it('suppresses a cache-only placement when remove_promotions is owned', async () => {
    await act(async () => { await cachePromotionEntitlement({ owned: true, status: 'owned' }) })
    const screen = render(<I18nProvider><CachedPromotionSlot surface="rehearsal" /></I18nProvider>)
    expect(screen.queryByTestId('first-party-promotion:rehearsal')).toBeNull()
    expect(mockCommerce.currentEntitlement).not.toHaveBeenCalled()
  })

  it('reserves space but never flashes a promotion before ownership cache hydration', () => {
    const unknown = { hydrated: false, owned: false, status: 'unknown', updatedAtEpochMs: null } as const
    const ownedCache = { hydrated: true, owned: true, status: 'owned', updatedAtEpochMs: 123 } as const
    const screen = render(<I18nProvider><EntitlementGatedPromotionSlot entitlement={unknown} surface="rehearsal" /></I18nProvider>)
    expect(screen.queryByTestId('first-party-promotion:rehearsal')).toBeNull()
    expect(screen.getByTestId('promotion-placeholder:rehearsal')).toHaveStyle({ height: PROMOTION_SLOT_HEIGHT })
    screen.rerender(<I18nProvider><EntitlementGatedPromotionSlot entitlement={ownedCache} surface="rehearsal" /></I18nProvider>)
    expect(screen.queryByTestId('first-party-promotion:rehearsal')).toBeNull()
    expect(screen.queryByTestId('promotion-placeholder:rehearsal')).toBeNull()
  })

  it('reveals a placement only after a known not-owned result', async () => {
    const screen = render(<I18nProvider><CachedPromotionSlot surface="preflight" /></I18nProvider>)
    expect(screen.queryByTestId('first-party-promotion:preflight')).toBeNull()
    await act(async () => { await cachePromotionEntitlement({ owned: false, status: 'not_owned' }) })
    expect(screen.getByTestId('first-party-promotion:preflight')).toBeOnTheScreen()
  })
  it.each(['unknown', 'pending'] as const)('collapses an unavailable %s placement after cache hydration', (status) => {
    const screen = render(<I18nProvider><EntitlementGatedPromotionSlot entitlement={{ hydrated: true, owned: false, status, updatedAtEpochMs: null }} surface="library" /></I18nProvider>)
    expect(screen.queryByTestId('first-party-promotion:library')).toBeNull()
    expect(screen.queryByTestId('promotion-placeholder:library')).toBeNull()
  })

  it('fail-closes promotion rendering and storefront refresh during a critical session', async () => {
    setCriticalSessionActive(true)
    const screen = render(<I18nProvider><IdlePromotionSlot surface="library" /></I18nProvider>)
    expect(screen.queryByTestId('first-party-promotion:library')).toBeNull()
    expect(screen.queryByTestId('promotion-placeholder:library')).toBeNull()
    await act(async () => { await Promise.resolve() })
    expect(mockCommerce.currentEntitlement).not.toHaveBeenCalled()
  })

  it('hides a retained idle placement when preparation starts without a parent render', async () => {
    const screen = render(<I18nProvider><IdlePromotionSlot surface="library" /></I18nProvider>)
    await screen.findByTestId('first-party-promotion:library')
    act(() => setCriticalSessionActive(true))
    expect(screen.queryByTestId('first-party-promotion:library')).toBeNull()
  })

  it.each(['rehearsal', 'preflight'] as const)('hides the retained cache-only %s placement immediately when preparation starts', async (surface) => {
    await act(async () => { await cachePromotionEntitlement({ owned: false, status: 'not_owned' }) })
    const screen = render(<I18nProvider><CachedPromotionSlot surface={surface} /></I18nProvider>)
    expect(screen.getByTestId(`first-party-promotion:${surface}`)).toBeOnTheScreen()
    act(() => setCriticalSessionActive(true))
    expect(screen.queryByTestId(`first-party-promotion:${surface}`)).toBeNull()
    expect(mockCommerce.currentEntitlement).not.toHaveBeenCalled()
  })

  it('restores a retained idle panel after deliberate session exit without a parent render', async () => {
    setCriticalSessionActive(true)
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    expect(screen.queryByText(messages.en['promoCommerce.title'])).toBeNull()
    act(() => setCriticalSessionActive(false))
    await screen.findByText(messages.en['promoCommerce.available'])
    expect(mockCommerce.product).toHaveBeenCalledTimes(1)
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
  })

  it('restores a cached placement after exit without store access or cache mutation', async () => {
    await act(async () => { await cachePromotionEntitlement({ owned: false, status: 'not_owned' }) })
    const saved = getCachedPromotionEntitlement()
    const screen = render(<I18nProvider><CachedPromotionSlot surface="rehearsal" /></I18nProvider>)
    for (let index = 0; index < 20; index += 1) {
      act(() => setCriticalSessionActive(true))
      expect(screen.queryByTestId('first-party-promotion:rehearsal')).toBeNull()
      act(() => setCriticalSessionActive(false))
      expect(screen.getByTestId('first-party-promotion:rehearsal')).toBeOnTheScreen()
    }
    expect(getCachedPromotionEntitlement()).toBe(saved)
    expect(mockCommerce.product).not.toHaveBeenCalled()
    expect(mockCommerce.currentEntitlement).not.toHaveBeenCalled()
    expect(Storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('removes native observers during preparation and ignores their late callbacks', async () => {
    const remove = jest.fn()
    mockCommerce.addEntitlementListener.mockReturnValueOnce({ remove })
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    const changed = mockCommerce.addEntitlementListener.mock.calls[0]![0] as (event: typeof owned) => void
    act(() => setCriticalSessionActive(true))
    expect(screen.queryByText(messages.en['promoCommerce.title'])).toBeNull()
    expect(remove).toHaveBeenCalledTimes(1)
    await act(async () => changed(owned))
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
    act(() => setCriticalSessionActive(false))
    await screen.findByText(messages.en['promoCommerce.available'])
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(2)
    expect(mockCommerce.addEntitlementListener).toHaveBeenCalledTimes(2)
    await act(async () => changed(owned))
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(2)
  })

  it('excludes old product metadata after a retained panel leaves and reenters idle', async () => {
    let finishOld!: (value: typeof product) => void
    mockCommerce.product.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve }))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await waitFor(() => expect(mockCommerce.product).toHaveBeenCalledTimes(1))
    act(() => setCriticalSessionActive(true))
    mockCommerce.product.mockResolvedValueOnce({ ...product, displayPrice: '₪12.90' })
    act(() => setCriticalSessionActive(false))
    const newLabel = messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', '₪12.90')
    await screen.findByRole('button', { name: newLabel })
    await act(async () => finishOld(product))
    expect(screen.getByRole('button', { name: newLabel })).toBeEnabled()
    expect(screen.queryByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) })).toBeNull()
  })

  it('does not start a store read on session exit while its retained screen is blurred', async () => {
    mockFocused = false
    setCriticalSessionActive(true)
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    act(() => setCriticalSessionActive(false))
    await act(async () => { await Promise.resolve() })
    expect(mockCommerce.product).not.toHaveBeenCalled()
    expect(mockCommerce.currentEntitlement).not.toHaveBeenCalled()
    mockFocused = true
    screen.rerender(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    expect(mockCommerce.product).toHaveBeenCalledTimes(1)
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
  })

  it.each(['rehearsal', 'preflight'] as const)('keeps %s disconnected and its retained cache adapter isolated from storefronts', (route) => {
    const routeSource = readFileSync(join(process.cwd(), 'app', `${route}.tsx`), 'utf8')
    const gateSource = readFileSync(join(process.cwd(), 'src', 'promotions', 'CachedPromotionSlot.tsx'), 'utf8')
    expect(routeSource).not.toMatch(/CachedPromotionSlot|IdlePromotionCommerce|show-commerce/)
    expect(gateSource).not.toMatch(/show-commerce|currentEntitlement|\.product\(|\.purchase\(|\.restore\(/)
  })

  it('refreshes entitlement on an idle surface and removes its placement', async () => {
    mockCommerce.currentEntitlement.mockResolvedValue(owned)
    const screen = render(<I18nProvider><IdlePromotionSlot surface="library" /></I18nProvider>)
    await waitFor(() => expect(screen.queryByTestId('first-party-promotion:library')).toBeNull())
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
  })

  it('uses only the storefront-provided price and exposes restore', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    const purchaseButton = await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) })
    expect(purchaseButton).toBeEnabled()
    expect(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] })).toBeEnabled()
    expect(screen.queryByText(/\$\d|€\d|£\d/)).toBeNull()
  })

  it('does not claim ownership for a pending purchase', async () => {
    mockCommerce.purchase.mockResolvedValue({ ...notOwned, status: 'pending', outcome: 'pending' })
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    const purchaseButton = await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) })
    fireEvent.press(purchaseButton)
    await screen.findByText(messages.en['promoCommerce.pending'])
    expect(screen.queryByText(messages.en['promoCommerce.owned'])).toBeNull()
  })

  it('reports cancellation without granting removal', async () => {
    mockCommerce.purchase.mockResolvedValue({ ...notOwned, outcome: 'cancelled' })
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    const purchaseButton = await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) })
    fireEvent.press(purchaseButton)
    await screen.findByText(messages.en['promoCommerce.cancelled'])
    expect(screen.queryByText(messages.en['promoCommerce.owned'])).toBeNull()
  })

  it('rechecks the actual live gate when a previously rendered purchase is pressed', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    const button = await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) })
    act(() => setCriticalSessionActive(true))
    fireEvent.press(button)
    expect(mockCommerce.purchase).not.toHaveBeenCalled()
  })

  it('does not let an earlier background refresh replace a completed restore', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    let finishRefresh!: (value: typeof notOwned) => void
    mockCommerce.currentEntitlement.mockReturnValueOnce(new Promise((resolve) => { finishRefresh = resolve }))
    const oldRefresh = refreshIdleEntitlement()
    await act(async () => { await Promise.resolve() })
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await screen.findByText(messages.en['promoCommerce.restoreSuccess'])
    await act(async () => { finishRefresh(notOwned); await oldRefresh })
    expect(getCachedPromotionEntitlement().owned).toBe(true)
    expect(screen.getByRole('button', { name: messages.en['promoCommerce.owned'] })).toBeDisabled()
  })

  it('does not treat a cancelled checkout as revocation of independently confirmed ownership', async () => {
    let finish!: (value: object) => void
    mockCommerce.purchase.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    fireEvent.press(await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    await act(async () => { await cachePromotionEntitlement({ owned: true, status: 'owned' }); finish({ ...notOwned, outcome: 'cancelled' }) })
    await screen.findByText(messages.en['promoCommerce.cancelled'])
    expect(getCachedPromotionEntitlement().owned).toBe(true)
  })

  it('admits one restore even when two presses arrive in the same render', async () => {
    let finish!: (value: typeof owned) => void
    mockCommerce.restore.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    const button = screen.getByRole('button', { name: messages.en['promoCommerce.restore'] })
    act(() => { fireEvent.press(button); fireEvent.press(button) })
    try { expect(mockCommerce.restore).toHaveBeenCalledTimes(1) }
    finally { await act(async () => finish(owned)) }
  })

  it('offers an immediate retry after metadata fails, without requiring navigation', async () => {
    mockCommerce.product.mockRejectedValueOnce(new Error('Store temporarily unavailable'))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.unavailable'])
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    expect(await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) })).toBeEnabled()
    expect(mockCommerce.purchase).not.toHaveBeenCalled()
  })

  it('contains a synchronous native metadata failure and keeps Restore available', async () => {
    mockCommerce.product.mockImplementationOnce(() => { throw new Error('Native module unavailable') })
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.unavailable'])
    expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeEnabled()
    expect(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] })).toBeEnabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await screen.findByText(messages.en['promoCommerce.available'])
  })

  it('contains synchronous ownership-query failure and preserves the earlier offline purchase', async () => {
    await cachePromotionEntitlement({ owned: true, status: 'owned' })
    mockCommerce.currentEntitlement.mockResolvedValue(owned)
    mockCommerce.currentEntitlement.mockImplementationOnce(() => { throw new Error('Store bridge unavailable') })
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.unavailable'])
    expect(getCachedPromotionEntitlement().owned).toBe(true)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.retry'] }))
    await screen.findByText(messages.en['promoCommerce.available'])
    expect(getCachedPromotionEntitlement().owned).toBe(true)
  })

  it('keeps Retry visible and disabled while its store check is pending', async () => {
    mockCommerce.product.mockRejectedValueOnce(new Error('Unavailable'))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.unavailable'])
    let finish!: (value: typeof product) => void
    mockCommerce.product.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const retry = screen.getByRole('button', { name: messages.en['common.retry'] })
    act(() => { fireEvent.press(retry); fireEvent.press(retry) })
    expect(screen.getByRole('button', { name: messages.en['common.retry'] })).toBeDisabled()
    expect(screen.getByText(messages.en['promoCommerce.checking'])).toBeTruthy()
    await waitFor(() => expect(mockCommerce.product).toHaveBeenCalledTimes(2))
    await act(async () => finish(product))
    expect(screen.queryByRole('button', { name: messages.en['common.retry'] })).toBeNull()
    expect(screen.getByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) })).toBeEnabled()
  })

  it('distinguishes a confirmed purchase from failure to save its offline copy', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('No storage space'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    await screen.findByText(messages.en['promoCommerce.cacheNotSaved'])
    expect(screen.getByRole('button', { name: messages.en['promoCommerce.owned'] })).toBeDisabled()
    expect(getCachedPromotionEntitlement().owned).toBe(true)
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await screen.findByText(messages.en['promoCommerce.restoreSuccess'])
    expect(JSON.parse([...mockStorageValues.values()][0]!).owned).toBe(true)
    expect(mockCommerce.purchase).toHaveBeenCalledTimes(1)
  })

  it('confirms native delivery only after the SQLite ownership write completes', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    let save!: () => void
    jest.mocked(Storage.setItem).mockImplementationOnce((key, value) => {
      if (typeof value !== 'string') throw new Error('Expected a serialized ownership record')
      return new Promise((resolve) => { save = () => { mockStorageValues.set(key, value); resolve() } })
    })
    mockCommerce.purchase.mockResolvedValueOnce({ ...owned, outcome: 'purchased', deliveryId: 'native-delivery' })
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    await waitFor(() => expect(getCachedPromotionEntitlement().owned).toBe(true))
    expect(mockCommerce.completeDelivery).not.toHaveBeenCalled()
    expect(JSON.parse([...mockStorageValues.values()][0]!).owned).toBe(false)
    await act(async () => save())
    await screen.findByText(messages.en['promoCommerce.purchaseSuccess'])
    expect(mockCommerce.completeDelivery).toHaveBeenCalledWith('native-delivery')
    const persisted = JSON.parse([...mockStorageValues.values()][0]!)
    expect(persisted.owned).toBe(true)
    expect(persisted.deliveryId).toBeUndefined()
  })

  it('does not finish delivery after a failed ownership save and Restore can retry it', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('Disk full'))
    mockCommerce.purchase.mockResolvedValueOnce({ ...owned, outcome: 'purchased', deliveryId: 'native-delivery' })
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    await screen.findByText(messages.en['promoCommerce.cacheNotSaved'])
    expect(mockCommerce.completeDelivery).not.toHaveBeenCalled()
    mockCommerce.restore.mockResolvedValueOnce({ ...owned, deliveryId: 'restored-delivery' })
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await screen.findByText(messages.en['promoCommerce.restoreSuccess'])
    expect(mockCommerce.completeDelivery).toHaveBeenCalledTimes(1)
    expect(mockCommerce.completeDelivery).toHaveBeenCalledWith('restored-delivery')
  })

  it('preserves saved ownership when store confirmation fails and exposes a truthful Restore path', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    mockCommerce.purchase.mockResolvedValueOnce({ ...owned, outcome: 'purchased', deliveryId: 'native-delivery' })
    mockCommerce.completeDelivery.mockRejectedValueOnce(new Error('Store unavailable'))
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    await screen.findByText(messages.en['promoCommerce.confirmationPending'])
    expect(getCachedPromotionEntitlement().owned).toBe(true)
    expect(JSON.parse([...mockStorageValues.values()][0]!).owned).toBe(true)
    expect(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] })).toBeEnabled()
    mockCommerce.restore.mockResolvedValueOnce({ ...owned, deliveryId: 'native-delivery' })
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await screen.findByText(messages.en['promoCommerce.restoreSuccess'])
  })

  it('stores a late paid result during preparation but defers store confirmation until idle', async () => {
    let finish!: (value: object) => void
    mockCommerce.purchase.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    fireEvent.press(await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    screen.unmount(); setCriticalSessionActive(true)
    await act(async () => finish({ ...owned, outcome: 'purchased', deliveryId: 'native-delivery' }))
    await waitFor(() => expect(JSON.parse([...mockStorageValues.values()][0]!).owned).toBe(true))
    expect(mockCommerce.completeDelivery).not.toHaveBeenCalled()
    setCriticalSessionActive(false)
    mockCommerce.currentEntitlement.mockResolvedValueOnce({ ...owned, deliveryId: 'native-delivery' })
    await act(async () => { await refreshIdleEntitlement() })
    expect(mockCommerce.completeDelivery).toHaveBeenCalledWith('native-delivery')
  })

  it('does not finish delivery for an obsolete idle observation', async () => {
    let finish!: (value: object) => void
    mockCommerce.currentEntitlement.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const obsolete = refreshIdleEntitlement(); await act(async () => { await Promise.resolve() })
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    fireEvent.press(await screen.findByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await screen.findByText(messages.en['promoCommerce.restoreSuccess'])
    await act(async () => { finish({ ...owned, deliveryId: 'old-delivery' }); await obsolete })
    expect(mockCommerce.completeDelivery).not.toHaveBeenCalled()
  })

  it('does not confirm an old ownership write superseded by a newer restore', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    let finishSave!: () => void
    jest.mocked(Storage.setItem).mockImplementationOnce((key, value) => {
      if (typeof value !== 'string') throw new Error('Expected serialized ownership')
      return new Promise((resolve) => { finishSave = () => { mockStorageValues.set(key, value); resolve() } })
    })
    mockCommerce.currentEntitlement.mockResolvedValueOnce({ ...owned, deliveryId: 'obsolete-delivery' })
    const obsolete = refreshIdleEntitlement()
    await waitFor(() => expect(getCachedPromotionEntitlement().owned).toBe(true))
    mockCommerce.restore.mockResolvedValueOnce(notOwned)
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await waitFor(() => expect(getCachedPromotionEntitlement().owned).toBe(false))
    await act(async () => { finishSave(); await obsolete })
    await screen.findByText(messages.en['promoCommerce.restoreNone'])
    expect(mockCommerce.completeDelivery).not.toHaveBeenCalled()
    expect(JSON.parse([...mockStorageValues.values()][0]!).owned).toBe(false)
  })

  it('reconciles native approval events from the current store snapshot and confirms saved delivery', async () => {
    render(<I18nProvider><IdlePromotionSlot surface="library" /></I18nProvider>)
    await waitFor(() => expect(getCachedPromotionEntitlement().status).toBe('not_owned'))
    const changed = mockCommerce.addEntitlementListener.mock.calls[0]![0] as (event: typeof owned) => void
    mockCommerce.currentEntitlement.mockResolvedValueOnce({ ...owned, deliveryId: 'approved-delivery' })
    await act(async () => changed(owned))
    await waitFor(() => expect(mockCommerce.completeDelivery).toHaveBeenCalledWith('approved-delivery'))
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(2)
    expect(JSON.parse([...mockStorageValues.values()][0]!).owned).toBe(true)
  })

  it('rejects store events during a newly critical session before rerendering', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    const changed = mockCommerce.addEntitlementListener.mock.calls[0]![0] as (event: typeof owned) => void
    act(() => setCriticalSessionActive(true))
    await act(async () => changed(owned))
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
    expect(mockCommerce.product).toHaveBeenCalledTimes(1)
    expect(mockCommerce.completeDelivery).not.toHaveBeenCalled()
  })

  it('drops late native events after observer teardown', async () => {
    const remove = jest.fn(); mockCommerce.addEntitlementListener.mockReturnValueOnce({ remove })
    const screen = render(<I18nProvider><IdlePromotionSlot surface="library" /></I18nProvider>)
    await waitFor(() => expect(getCachedPromotionEntitlement().status).toBe('not_owned'))
    const changed = mockCommerce.addEntitlementListener.mock.calls[0]![0] as (event: typeof owned) => void
    screen.unmount(); await act(async () => changed(owned))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
  })

  it('suspends hidden settings observers and loads only after that route is focused again', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    const obsolete = mockCommerce.addEntitlementListener.mock.calls[0]![0] as (event: typeof owned) => void
    mockFocused = false; screen.rerender(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await act(async () => obsolete(owned))
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
    expect(mockCommerce.product).toHaveBeenCalledTimes(1)
    mockCommerce.currentEntitlement.mockResolvedValueOnce(owned)
    mockFocused = true; screen.rerender(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await waitFor(() => expect(getCachedPromotionEntitlement().owned).toBe(true))
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(2)
  })

  it('does not start a store read after its idle page closes during cache hydration', async () => {
    let finish!: (value: string | null) => void
    jest.mocked(Storage.getItem).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const screen = render(<I18nProvider><IdlePromotionSlot surface="library" /></I18nProvider>)
    await act(async () => { await Promise.resolve() })
    screen.unmount()
    await act(async () => finish(null))
    expect(mockCommerce.currentEntitlement).not.toHaveBeenCalled()
    expect(mockCommerce.completeDelivery).not.toHaveBeenCalled()
  })

  it('lets the new focused consumer commit a shared read without duplicating delivery confirmation', async () => {
    let finish!: (value: object) => void
    mockCommerce.currentEntitlement.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    let firstActive = true
    const first = refreshIdleEntitlement(() => firstActive)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    firstActive = false
    const second = refreshIdleEntitlement(() => true)
    await act(async () => { await Promise.resolve() })
    await act(async () => { finish({ ...owned, deliveryId: 'shared-delivery' }); await Promise.all([first, second]) })
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
    expect(mockCommerce.completeDelivery).toHaveBeenCalledTimes(1)
    expect(mockCommerce.completeDelivery).toHaveBeenCalledWith('shared-delivery')
    expect(getCachedPromotionEntitlement().owned).toBe(true)
  })

  it('ignores background native events and reconciles on the next idle foreground return', async () => {
    let foreground!: (state: AppStateStatus) => void
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { foreground = listener; return { remove() {} } })
    try {
      const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
      await screen.findByText(messages.en['promoCommerce.available'])
      const changed = mockCommerce.addEntitlementListener.mock.calls[0]![0] as (event: typeof owned) => void
      AppState.currentState = 'background'; await act(async () => changed(owned))
      expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(1)
      mockCommerce.currentEntitlement.mockResolvedValueOnce(owned)
      AppState.currentState = 'active'; await act(async () => foreground('active'))
      await waitFor(() => expect(getCachedPromotionEntitlement().owned).toBe(true))
      expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(2)
    } finally { AppState.currentState = 'active'; spy.mockRestore() }
  })

  it.each(['unknown', 'pending'] as const)('does not call an uncertain %s restore a missing purchase', async (status) => {
    mockCommerce.currentEntitlement.mockResolvedValue(owned)
    mockCommerce.restore.mockResolvedValue({ ...notOwned, status })
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await screen.findByText(messages.en[status === 'pending' ? 'promoCommerce.pending' : 'promoCommerce.unavailable'])
    expect(screen.queryByText(messages.en['promoCommerce.restoreNone'])).toBeNull()
    expect(getCachedPromotionEntitlement().owned).toBe(true)
  })

  it('keeps a paid result after the panel leaves without launching more store work', async () => {
    let finish!: (value: object) => void
    mockCommerce.purchase.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    fireEvent.press(await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    screen.unmount(); setCriticalSessionActive(true)
    await act(async () => finish({ ...owned, outcome: 'purchased' }))
    await waitFor(() => expect(getCachedPromotionEntitlement().owned).toBe(true))
    expect(JSON.parse([...mockStorageValues.values()][0]!).owned).toBe(true)
    expect(mockCommerce.purchase).toHaveBeenCalledTimes(1)
    expect(mockCommerce.restore).not.toHaveBeenCalled()
  })

  it('admits one interactive operation across two mounted panels', async () => {
    let finish!: (value: typeof owned) => void
    mockCommerce.restore.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const screen = render(<I18nProvider><PromotionPurchasePanel /><PromotionPurchasePanel /></I18nProvider>)
    await screen.findAllByText(messages.en['promoCommerce.available'])
    const buttons = screen.getAllByRole('button', { name: messages.en['promoCommerce.restore'] })
    act(() => { fireEvent.press(buttons[0]!); fireEvent.press(buttons[1]!) })
    try { expect(mockCommerce.restore).toHaveBeenCalledTimes(1) }
    finally { await act(async () => finish(owned)) }
    expect(getCachedPromotionEntitlement().owned).toBe(true)
  })

  it('does not let an obsolete refresh clear the single-flight owner of a newer refresh', async () => {
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    let oldFinish!: (value: typeof notOwned) => void, newFinish!: (value: typeof owned) => void
    mockCommerce.currentEntitlement.mockReturnValueOnce(new Promise((resolve) => { oldFinish = resolve }))
    const oldRead = refreshIdleEntitlement(); await act(async () => { await Promise.resolve() })
    fireEvent.press(screen.getByRole('button', { name: messages.en['promoCommerce.restore'] }))
    await screen.findByText(messages.en['promoCommerce.restoreSuccess'])
    mockCommerce.currentEntitlement.mockReturnValueOnce(new Promise((resolve) => { newFinish = resolve }))
    const newRead = refreshIdleEntitlement(); await act(async () => { await Promise.resolve() })
    await act(async () => { oldFinish(notOwned); await oldRead })
    const joinedRead = refreshIdleEntitlement(); await act(async () => { await Promise.resolve() })
    expect(mockCommerce.currentEntitlement).toHaveBeenCalledTimes(3)
    await act(async () => { newFinish(owned); await Promise.all([newRead, joinedRead]) })
    expect(getCachedPromotionEntitlement().owned).toBe(true)
  })

  it('keeps free silent preparation independent of a pending checkout', async () => {
    let finish!: (value: object) => void
    mockCommerce.purchase.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    fireEvent.press(await screen.findByRole('button', { name: messages.en['promoCommerce.purchaseWithPrice'].replace('{price}', product.displayPrice) }))
    const engine = { prepare: jest.fn(async () => undefined), dispatch: jest.fn(async () => undefined), shutdown: jest.fn(async () => undefined), subscribe: () => ({ remove() {} }) }
    const session = new ShowSession({ engine })
    const subscription = session.subscribe((state) => setCriticalSessionActive(isCriticalShowSession(state)))
    try {
      await act(async () => { await session.prepareShow(sampleShow, 'set-main', sampleControllerProfiles) })
      expect(session.getState().phase).toBe('ready')
      expect(engine.prepare).toHaveBeenCalledTimes(1)
      await act(async () => finish({ ...owned, outcome: 'purchased' }))
      await waitFor(() => expect(getCachedPromotionEntitlement().owned).toBe(true))
      expect(session.getState().phase).toBe('ready')
      expect(engine.dispatch).not.toHaveBeenCalled()
    } finally { subscription.remove(); await act(async () => { await session.shutdown(); setCriticalSessionActive(false) }) }
  })

  it('defers a late idle observation instead of changing the cache during a prepared show', async () => {
    mockCommerce.currentEntitlement.mockResolvedValueOnce(owned)
    const screen = render(<I18nProvider><PromotionPurchasePanel /></I18nProvider>)
    await screen.findByText(messages.en['promoCommerce.available'])
    let finish!: (value: typeof notOwned) => void
    mockCommerce.currentEntitlement.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const oldRead = refreshIdleEntitlement(); await act(async () => { await Promise.resolve() })
    act(() => setCriticalSessionActive(true))
    await act(async () => { finish(notOwned); await oldRead })
    expect(getCachedPromotionEntitlement().owned).toBe(true)
    act(() => setCriticalSessionActive(false))
    await act(async () => { await refreshIdleEntitlement() })
    expect(getCachedPromotionEntitlement().owned).toBe(false)
  })

  it.each(['run', 'recovery'] as const)('keeps promotion code out of the %s live route', (route) => {
    const source = readFileSync(join(process.cwd(), 'app', `${route}.tsx`), 'utf8')
    expect(source).not.toMatch(/PromotionSlot|promotions|show-commerce/i)
  })

  it('keeps the shared screen module free of promotion subsystem imports', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'ui', 'screens.tsx'), 'utf8')
    expect(source).not.toMatch(/from ['"]\.\.\/promotions|from ['"].*show-commerce/)
  })

  it('keeps commerce and promotion imports out of every live entry point', () => {
    for (const route of ['run', 'recovery']) {
      const source = readFileSync(join(process.cwd(), 'app', `${route}.tsx`), 'utf8')
      expect(source).not.toMatch(/Promotion|Commerce|show-commerce|entitlementCache/)
    }
    const screens = readFileSync(join(process.cwd(), 'src', 'ui', 'screens.tsx'), 'utf8')
    expect(screens).not.toMatch(/from ['"].*(promotions|show-commerce)/)
  })
})
