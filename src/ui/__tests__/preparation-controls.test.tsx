import { act, fireEvent, render } from '@testing-library/react-native'
import { useState } from 'react'
import * as ReactNative from 'react-native'
import { I18nProvider, messages, useI18n, type Locale } from '../../i18n'
import { DEFAULT_LIBRARY_SETTINGS } from '../../library/types'
import { Segments, ValueSlider } from '../primitives'
import { SettingsScreen } from '../screens'

let mockLocale: Locale = 'en'
let dimensions: jest.SpyInstance<ReturnType<typeof ReactNative.useWindowDimensions>, []>
const mockChange = jest.fn()
const mockUpdateSettings = jest.fn().mockResolvedValue(undefined)
const mockApp = {
  busy: false, liveSession: false, show: null,
  library: { updateSettings: (settings: unknown) => mockUpdateSettings(settings) },
  libraryState: { status: 'ready', settings: { ...DEFAULT_LIBRARY_SETTINGS } },
  runTask: async (work: () => Promise<unknown>) => { await work(); return true },
}
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: mockLocale }] }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), canGoBack: () => false, replace: jest.fn() }) }))
jest.mock('../AppProvider', () => ({ useApp: () => mockApp }))
jest.mock('../library-screens', () => ({ OperationStatus: () => null }))
jest.mock('../BackupPanel', () => ({ BackupPanel: () => null }))
jest.mock('../BackgroundReliabilityPanel', () => ({ BackgroundReliabilityPanel: () => null }))

const wrap = (children: React.ReactNode) => <I18nProvider>{children}</I18nProvider>
function Selector({ disabled = false }: { disabled?: boolean }) {
  const { t } = useI18n(); const [selected, setSelected] = useState('appearance')
  return <Segments options={[{ value: 'appearance', label: t('settings.appearance') }, { value: 'backup', label: t('settings.backup') }, { value: 'more', label: t('use.settings.tools') }]} selected={selected} disabled={disabled} onChange={(value) => { mockChange(value); setSelected(value) }} />
}
function Seek({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState(0)
  return <ValueSlider label="Position" value={value} min={0} max={2.4} step={0.001} adjustmentStep={1} disabled={disabled} onChange={(next) => { mockChange(next); setValue(next) }} />
}
function TrimmedSeek({ min = 10, max = 20, initial = 10 }: { min?: number; max?: number; initial?: number }) {
  const [value, setValue] = useState(initial)
  return <ValueSlider interactionRange={{ min, max }} label="Trimmed position" value={value} min={0} max={30} step={0.001} adjustmentStep={1} onChange={(next) => { mockChange(next); setValue(Math.max(min, Math.min(max, next))) }} />
}
beforeEach(() => {
  jest.clearAllMocks(); mockLocale = 'en'; mockApp.busy = false; mockApp.libraryState.settings = { ...DEFAULT_LIBRARY_SETTINGS }
  dimensions = jest.spyOn(jest.requireActual<typeof ReactNative>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 360, height: 800, scale: 1, fontScale: 1 })
})
afterEach(() => jest.restoreAllMocks())

describe('preparation labels and selection at large text', () => {
  it.each(['en', 'he', 'ar'] as const)('keeps full %s selector names, selected state and single action through large-text reflow', (locale) => {
    mockLocale = locale
    dimensions.mockReturnValue({ width: 320, height: 800, scale: 1, fontScale: 2 })
    const screen = render(wrap(<Selector />))
    const dictionary = messages[locale]
    const first = screen.getByRole('button', { name: dictionary['settings.appearance'] })
    expect(first.props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByRole('button', { name: dictionary['settings.backup'] }))
    expect(mockChange).toHaveBeenCalledTimes(1); expect(mockChange).toHaveBeenLastCalledWith('backup')
    expect(screen.getByRole('button', { name: dictionary['settings.backup'] }).props.accessibilityState.selected).toBe(true)
    screen.rerender(wrap(<Selector disabled />))
    for (const key of ['settings.appearance', 'settings.backup', 'use.settings.tools'] as const) expect(screen.getByRole('button', { name: dictionary[key] })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: dictionary['use.settings.tools'] }))
    expect(mockChange).toHaveBeenCalledTimes(1)
  })

  it.each([1, 2])('keeps all Settings sections and complete theme names usable at font scale %s', async (fontScale) => {
    dimensions.mockReturnValue({ width: 360, height: 800, scale: 1, fontScale })
    const screen = render(wrap(<SettingsScreen />))
    for (const key of ['theme.darkBlue', 'theme.purpleNight', 'theme.cobra'] as const) expect(screen.getByRole('button', { name: messages.en[key] })).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: messages.en['theme.purpleNight'] })) })
    expect(mockUpdateSettings).toHaveBeenCalledTimes(1); expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'purpleNight' })
    mockApp.libraryState.settings = { ...DEFAULT_LIBRARY_SETTINGS, theme: 'purpleNight' }
    screen.rerender(wrap(<SettingsScreen />))
    expect(screen.getByRole('button', { name: messages.en['theme.purpleNight'] }).props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByRole('button', { name: messages.en['settings.backup'] }))
    expect(screen.getByRole('button', { name: messages.en['settings.backup'] }).props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByRole('button', { name: messages.en['settings.appearance'] }))
    mockApp.busy = true; screen.rerender(wrap(<SettingsScreen />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['theme.cobra'] }))
    expect(screen.getByRole('button', { name: messages.en['theme.cobra'] })).toBeDisabled(); expect(mockUpdateSettings).toHaveBeenCalledTimes(1)
  })
})

describe('useful seek adjustments with precise source-time input', () => {
  it('does not accumulate a hidden seek offset when its controlled parent clamps to trim bounds', () => {
    const screen = render(wrap(<TrimmedSeek />))
    const decrease = screen.getByRole('button', { name: messages.en['common.decrease'] + ' · Trimmed position' })
    expect(decrease).toBeDisabled()
    expect(screen.getByRole('adjustable').props.accessibilityValue).toMatchObject({ min: 10, max: 20, now: 10 })
    fireEvent.press(decrease); fireEvent.press(decrease); fireEvent.press(decrease)
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.increase'] + ' · Trimmed position' }))
    expect(screen.getByRole('adjustable').props.accessibilityValue.now).toBe(11)
    expect(mockChange.mock.calls.map(([value]) => value)).toEqual([11])
  })

  it('ignores screen-reader adjustments beyond the playable ends without losing the next useful step', () => {
    const screen = render(wrap(<TrimmedSeek max={11.999} initial={11.9} />))
    const adjust = (actionName: string) => fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName } })
    adjust('increment'); adjust('increment'); adjust('increment')
    expect(mockChange).toHaveBeenCalledTimes(1); expect(mockChange).toHaveBeenLastCalledWith(11.999)
    expect(screen.getByRole('button', { name: messages.en['common.increase'] + ' · Trimmed position' })).toBeDisabled()
    adjust('decrement'); expect(mockChange.mock.calls.at(-1)![0]).toBeCloseTo(10.999, 6)
    adjust('decrement'); adjust('decrement'); adjust('decrement')
    expect(mockChange).toHaveBeenCalledTimes(3); expect(mockChange).toHaveBeenLastCalledWith(10)
    adjust('increment'); expect(mockChange).toHaveBeenLastCalledWith(11)
  })

  it('maps pointer positions across the full source, clamps to trim, and retains millisecond precision', () => {
    const screen = render(wrap(<TrimmedSeek />))
    const slider = screen.getByRole('adjustable')
    fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 300 } } })
    fireEvent.press(slider, { nativeEvent: { locationX: 300 } })
    fireEvent.press(slider, { nativeEvent: { locationX: 123.45 } })
    fireEvent.press(slider, { nativeEvent: { locationX: 0 } })
    expect(mockChange.mock.calls.map(([value]) => value)).toEqual([20, 12.345, 10])
  })

  it('allows the first pointer tap at the current position to request audible scrubbing', () => {
    const screen = render(wrap(<TrimmedSeek />))
    const slider = screen.getByRole('adjustable')
    fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 300 } } })
    fireEvent(slider, 'touchStart', { nativeEvent: { locationX: 100, locationY: 0 } })
    fireEvent(slider, 'touchEnd', { nativeEvent: { locationX: 100, locationY: 0 } })
    fireEvent.press(slider, { nativeEvent: { locationX: 100 } })
    expect(mockChange).toHaveBeenCalledTimes(1); expect(mockChange).toHaveBeenLastCalledWith(10)
  })

  it('uses updated trim bounds immediately even when the controlled source value has not changed', () => {
    const screen = render(wrap(<TrimmedSeek />))
    screen.rerender(wrap(<TrimmedSeek min={12} />))
    expect(screen.getByRole('adjustable').props.accessibilityValue).toMatchObject({ min: 12, max: 20, now: 12 })
    expect(screen.getByRole('button', { name: messages.en['common.decrease'] + ' · Trimmed position' })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.increase'] + ' · Trimmed position' }))
    expect(mockChange).toHaveBeenCalledTimes(1); expect(mockChange).toHaveBeenLastCalledWith(13)
  })

  it('clips valid interaction bounds to the available source', () => {
    const screen = render(wrap(<ValueSlider label="Position" value={10} min={0} max={30} interactionRange={{ min: -5, max: 40 }} onChange={mockChange} />))
    const slider = screen.getByRole('adjustable')
    expect(slider.props.accessibilityValue).toMatchObject({ min: 0, max: 30 })
    fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 300 } } })
    fireEvent.press(slider, { nativeEvent: { locationX: -100 } })
    fireEvent.press(slider, { nativeEvent: { locationX: 400 } })
    expect(mockChange.mock.calls.map(([value]) => value)).toEqual([0, 30])
  })

  it.each([{ min: 20, max: 10 }, { min: Number.NaN, max: 20 }, { min: 10, max: Number.POSITIVE_INFINITY }, { min: 10, max: 10 }, { min: 40, max: 50 }])('blocks unsafe or empty playable bounds: %s', (interactionRange) => {
    const screen = render(wrap(<ValueSlider label="Position" value={10} min={0} max={30} interactionRange={interactionRange} onChange={mockChange} />))
    const slider = screen.getByRole('adjustable')
    expect(slider).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['common.decrease'] + ' · Position' })).toBeDisabled()
    expect(screen.getByRole('button', { name: messages.en['common.increase'] + ' · Position' })).toBeDisabled()
    fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 300 } } })
    fireEvent.press(slider, { nativeEvent: { locationX: 150 } })
    fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(mockChange).not.toHaveBeenCalled()
  })
  it('uses one-second touch adjustments and clamps a partial final second', () => {
    const screen = render(wrap(<Seek />))
    const increase = () => fireEvent.press(screen.getByRole('button', { name: messages.en['common.increase'] + ' · Position' }))
    increase(); increase(); increase()
    expect(mockChange.mock.calls.map(([value]) => value)).toEqual([1, 2, 2.4])
    expect(screen.getByRole('button', { name: messages.en['common.increase'] + ' · Position' })).toBeDisabled()
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.decrease'] + ' · Position' }))
    expect(mockChange.mock.calls.at(-1)![0]).toBeCloseTo(1.4, 6)
  })

  it('uses the same useful screen-reader step, clamps both endpoints and ignores unrelated actions', () => {
    const screen = render(wrap(<Seek />))
    const adjust = (actionName: string) => fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName } })
    adjust('increment'); expect(mockChange).toHaveBeenLastCalledWith(1)
    adjust('increment'); adjust('increment'); expect(mockChange).toHaveBeenLastCalledWith(2.4)
    adjust('decrement'); adjust('decrement'); adjust('decrement'); expect(mockChange).toHaveBeenLastCalledWith(0)
    const count = mockChange.mock.calls.length; adjust('activate'); expect(mockChange).toHaveBeenCalledTimes(count)
  })

  it('retains millisecond pointer positioning when button adjustments are one second', () => {
    const screen = render(wrap(<ValueSlider label="Position" value={0} min={0} max={10} step={0.001} adjustmentStep={1} onChange={mockChange} />))
    const slider = screen.getByRole('adjustable')
    fireEvent(slider, 'layout', { nativeEvent: { layout: { width: 1000 } } })
    fireEvent(slider, 'touchStart', { nativeEvent: { locationX: 5.3, locationY: 0 } })
    fireEvent(slider, 'touchEnd', { nativeEvent: { locationX: 5.3, locationY: 0 } })
    expect(mockChange).toHaveBeenCalledTimes(1); expect(mockChange.mock.calls[0]![0]).toBeCloseTo(0.053, 6)
  })

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])('preserves the original fine increment when adjustmentStep is unavailable or invalid: %s', (adjustmentStep) => {
    const screen = render(wrap(<ValueSlider label="Rate" value={1} min={0.7} max={2} step={0.05} {...(adjustmentStep === undefined ? {} : { adjustmentStep })} onChange={mockChange} />))
    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(mockChange.mock.calls[0]![0]).toBeCloseTo(1.05, 6)
  })

  it('prevents disabled touch and screen-reader changes', () => {
    const screen = render(wrap(<Seek disabled />))
    fireEvent.press(screen.getByRole('button', { name: messages.en['common.increase'] + ' · Position' }))
    fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } })
    expect(mockChange).not.toHaveBeenCalled()
  })
})
