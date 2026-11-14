import { fireEvent, render, within } from '@testing-library/react-native'
import { StyleSheet, TextInput } from 'react-native'
import { color, font, size } from '../../design'
import { themeColors } from '../../design/ThemeProvider'
import { I18nProvider, messages } from '../../i18n'
import { setCriticalSessionActive } from '../../runtime'
import { FeedbackContext, type TaskFailure } from '../feedback'
import { AppShell, AppText, Badge, Button, ChoiceChip, Disclosure, Field, SectionHeader, Segments, splitsWord, StatusBanner, SwitchRow, TaskRow, ValueSlider } from '../primitives'
import { formatTime } from '../screens'

afterEach(() => jest.restoreAllMocks())
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() }) }))

const wrap = (node: React.ReactNode) => <I18nProvider>{node}</I18nProvider>
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>
const pressableStyle = (element: { props: Record<string, unknown> }, pressed = false) => {
  const style = element.props.style as unknown
  return flat(typeof style === 'function' ? style({ pressed }) : style)
}
const layoutKeys = ['borderWidth', 'padding', 'paddingHorizontal', 'paddingVertical', 'margin', 'width', 'height', 'minHeight', 'minWidth'] as const
const layoutOf = (style: Record<string, unknown>) => Object.fromEntries(layoutKeys.map((key) => [key, style[key]]))

describe('button state ink', () => {
  it('keeps the dark GO ink while Arm is loading so the label never turns white-on-white', () => {
    const screen = render(wrap(<Button label="Arm" variant="go" state="loading" onPress={jest.fn()} />))
    expect(flat(screen.getByText('Arm…').props.style).color).toBe(color.goInk)
  })
  it('keeps the primary ink on a loading primary action', () => {
    const screen = render(wrap(<Button label="Save" variant="primary" state="loading" onPress={jest.fn()} />))
    expect(flat(screen.getByText('Save…').props.style).color).toBe(color.accentInk)
  })
  it('switches both GO label lines to light ink when error/confirmed replaces the fill', () => {
    for (const state of ['error', 'confirmed'] as const) {
      const screen = render(wrap(<Button label="GO · Opening" variant="go" state={state} onPress={jest.fn()} />))
      const prefix = state === 'error' ? '⚠ GO' : '✓ GO'
      expect(flat(screen.getByText(prefix).props.style).color).toBe(color.text)
      expect(flat(screen.getByText('Opening').props.style).color).toBe(color.text)
      screen.unmount()
    }
  })
})

describe('layout-neutral focus', () => {
  const cases = [
    ['Button', () => <Button label="Target" onPress={jest.fn()} />],
    ['TaskRow', () => <TaskRow label="Target" onPress={jest.fn()} />],
    ['Disclosure', () => <Disclosure title="Target"><></></Disclosure>],
    ['ChoiceChip', () => <ChoiceChip label="Target" selected={false} onPress={jest.fn()} />],
  ] as const
  it.each(cases)('%s shows an outline focus ring without changing its box', (_name, element) => {
    const screen = render(wrap(element()))
    const target = screen.getByRole('button', { name: 'Target' })
    const before = pressableStyle(target)
    expect(before.outlineWidth).toBeUndefined()
    fireEvent(target, 'focus')
    const focused = pressableStyle(screen.getByRole('button', { name: 'Target' }))
    expect(focused.outlineWidth).toBe(size.iconStroke)
    expect(focused.outlineStyle).toBe('solid')
    expect(layoutOf(focused)).toEqual(layoutOf(before))
    fireEvent(screen.getByRole('button', { name: 'Target' }), 'blur')
    expect(pressableStyle(screen.getByRole('button', { name: 'Target' })).outlineWidth).toBeUndefined()
  })
  it('keeps the GO control at its fixed height when focused', () => {
    const screen = render(wrap(<Button label="GO" variant="go" onPress={jest.fn()} />))
    fireEvent(screen.getByRole('button', { name: 'GO' }), 'focus')
    const style = pressableStyle(screen.getByRole('button', { name: 'GO' }))
    expect(style.height).toBe(size.go)
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth)
  })
})

describe('field focus', () => {
  it('uses the accent boundary while focused and keeps the danger boundary for invalid input', () => {
    const screen = render(wrap(<><Field label="Name" value="" onChange={jest.fn()} /><Field label="Bad" value="" invalid onChange={jest.fn()} /></>))
    const [valid, invalid] = screen.UNSAFE_getAllByType(TextInput)
    expect(flat(valid!.props.style).borderColor).toBe(themeColors.darkBlue.borderStrong)
    fireEvent(valid!, 'focus')
    expect(flat(screen.UNSAFE_getAllByType(TextInput)[0]!.props.style).borderColor).toBe(themeColors.darkBlue.accent)
    fireEvent(invalid!, 'focus')
    expect(flat(screen.UNSAFE_getAllByType(TextInput)[1]!.props.style).borderColor).toBe(themeColors.darkBlue.danger)
  })
})

describe('status banner and badge', () => {
  it('pairs every tone with a non-color glyph and a toned edge', () => {
    const screen = render(wrap(<><StatusBanner tone="warning" title="Low battery" /><StatusBanner tone="success" title="Ready" /></>))
    expect(screen.getByText('!')).toBeTruthy()
    expect(screen.getByText('✓')).toBeTruthy()
  })
  it('floors badge text shrink so long labels ellipsize rather than becoming unreadable', () => {
    const screen = render(wrap(<Badge label={'Unverschlüsselt'.repeat(8)} tone="warning" />))
    expect(screen.getByText('Unverschlüsselt'.repeat(8)).props.minimumFontScale).toBe(0.72)
  })
})

describe('failure notice actions', () => {
  afterEach(() => setCriticalSessionActive(false))
  it('wraps recovery actions instead of truncating long translations into fixed thirds', () => {
    const failure: TaskFailure = { detail: 'Invalid ZIP archive', busy: false, retry: jest.fn(), dismiss: jest.fn() }
    const screen = render(wrap(<FeedbackContext.Provider value={{ feedback: null, dismiss: jest.fn(), undo: jest.fn(), failure }}><AppShell current="/" scroll={false}><></></AppShell></FeedbackContext.Provider>))
    fireEvent(screen.getByTestId('app-bottom-section'), 'layout', { nativeEvent: { layout: { height: 120 } } })
    const actions = screen.getByTestId('app-feedback-actions')
    expect(flat(actions.props.style).flexWrap).toBe('wrap')
    for (const key of ['common.retry', 'common.diagnostics', 'common.dismiss'] as const) expect(within(actions).getByRole('button', { name: messages.en[key] })).toBeTruthy()
    // Content-sized basis (no flex: 1) is what lets a long label move to its own line.
    for (const child of actions.children) if (typeof child !== 'string') expect(flat(child.props.style).flex).toBeUndefined()
  })
})

describe('section header at large text', () => {
  it('drops the action below the display title past the chrome cap and keeps it inline otherwise', () => {
    const ReactNative = jest.requireActual<typeof import('react-native')>('react-native')
    const dimensions = jest.spyOn(ReactNative, 'useWindowDimensions')
    try {
      for (const [fontScale, direction] of [[1, 'row'], [2, undefined]] as const) {
        dimensions.mockReturnValue({ width: 320, height: 640, scale: 1, fontScale })
        const screen = render(wrap(<SectionHeader title="Bibliothek" action={<Button label="Neu" onPress={jest.fn()} />} />))
        let container = screen.getByRole('header').parent
        while (container && (container.type as unknown) !== 'View') container = container.parent
        expect(flat(container?.props.style).flexDirection).toBe(direction)
        expect(screen.getByRole('button', { name: 'Neu' })).toBeTruthy()
        screen.unmount()
      }
    } finally { dimensions.mockRestore() }
  })
})

describe('fitted text floor (New Architecture ignores minimumFontScale)', () => {
  const name = 'Grand finale with the entire company and a very long reprise '.repeat(4).trim()
  const visible = (screen: ReturnType<typeof render>) => screen.getAllByText(name, { includeHiddenElements: true }).find((node) => node.props.testID !== 'fit-floor-probe')!
  const measure = (screen: ReturnType<typeof render>, width: number, lineWidths: number[]) => {
    fireEvent(visible(screen), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 30 } } })
    fireEvent(screen.getByTestId('fit-floor-probe', { includeHiddenElements: true }), 'textLayout', { nativeEvent: { lines: lineWidths.map((lineWidth) => ({ text: 'x ', width: lineWidth, height: 30, x: 0, y: 0, ascender: 0, descender: 0, capHeight: 0, xHeight: 0 })) } })
  }
  it('renders at the floor size and ellipsizes when native fitting would go below it', () => {
    const screen = render(wrap(<AppText tone="title" numberOfLines={1} adjustsFontSizeToFit>{name}</AppText>))
    expect(screen.queryByTestId('fit-floor-probe', { includeHiddenElements: true })).toBeNull()
    measure(screen, 300, [1200])
    const text = visible(screen)
    expect(text.props.adjustsFontSizeToFit).toBe(false)
    expect(text.props.ellipsizeMode).toBe('tail')
    expect(flat(text.props.style).fontSize).toBeCloseTo(font.size.title * 0.72)
    expect(text.props.accessibilityLabel ?? text.props.children).toBe(name)
  })
  it('keeps native fitting for a small shrink and honours an explicit floor', () => {
    const screen = render(wrap(<AppText tone="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{name}</AppText>))
    measure(screen, 300, [450])
    expect(visible(screen).props.adjustsFontSizeToFit).toBe(true)
    measure(screen, 300, [560])
    expect(visible(screen).props.adjustsFontSizeToFit).toBe(false)
    expect(flat(visible(screen).props.style).fontSize).toBeCloseTo(font.size.caption * 0.6)
  })
  it('re-measures instead of staying clamped when the width grows', () => {
    const screen = render(wrap(<AppText tone="title" numberOfLines={1} adjustsFontSizeToFit>{name}</AppText>))
    measure(screen, 300, [1200])
    expect(visible(screen).props.adjustsFontSizeToFit).toBe(false)
    measure(screen, 1000, [1200])
    expect(visible(screen).props.adjustsFontSizeToFit).toBe(true)
  })
  it('leaves non-fitted text untouched', () => {
    const screen = render(wrap(<AppText>{name}</AppText>))
    fireEvent(screen.getByText(name), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 30 } } })
    expect(screen.queryByTestId('fit-floor-probe', { includeHiddenElements: true })).toBeNull()
  })
})

describe('word-break fallback', () => {
  it('distinguishes a split word from a legitimate wrap', () => {
    expect(splitsWord([{ text: 'Bibliothekssiche' }, { text: 'rungen' }])).toBe(true)
    expect(splitsWord([{ text: 'Purple ' }, { text: 'Night' }])).toBe(false)
    expect(splitsWord([{ text: 'Library' }])).toBe(false)
  })
  it('stacks segments once a label splits mid-word and keeps them inline otherwise', () => {
    // The jest Dimensions mock reports fontScale 2, which already stacks; measure at default text size.
    jest.spyOn(jest.requireActual<typeof import('react-native')>('react-native'), 'useWindowDimensions').mockReturnValue({ width: 375, height: 812, scale: 1, fontScale: 1 })
    const options = [{ value: 'a', label: 'Bibliothekssicherungen' }, { value: 'b', label: 'Darstellung' }] as const
    const screen = render(wrap(<Segments options={options} selected="a" onChange={jest.fn()} />))
    expect(pressableStyle(screen.getByRole('button', { name: 'Darstellung' })).alignSelf).toBeUndefined()
    fireEvent(screen.getByText('Darstellung'), 'textLayout', { nativeEvent: { lines: [{ text: 'Darstellung' }] } })
    expect(pressableStyle(screen.getByRole('button', { name: 'Darstellung' })).alignSelf).toBeUndefined()
    fireEvent(screen.getByText('Bibliothekssicherungen'), 'textLayout', { nativeEvent: { lines: [{ text: 'Bibliothekssiche' }, { text: 'rungen' }] } })
    expect(pressableStyle(screen.getByRole('button', { name: 'Darstellung' })).alignSelf).toBe('stretch')
  })
})

describe('stage blackout dimming', () => {
  it('dims GO in place without changing its box', () => {
    const screen = render(wrap(<><Button label="GO · Opening" variant="go" onPress={jest.fn()} /><Button label="GO · Finale" variant="go" dimmed onPress={jest.fn()} /></>))
    const normal = pressableStyle(screen.getByRole('button', { name: 'GO · Opening' }))
    const dimmed = pressableStyle(screen.getByRole('button', { name: 'GO · Finale' }))
    expect(dimmed.backgroundColor).toBe(color.blackout)
    expect(layoutOf(dimmed)).toEqual(layoutOf(normal))
    expect(flat(screen.getByText('Opening').props.style).color).toBe(color.goInk)
    expect(flat(screen.getByText('Finale').props.style).color).toBe(color.textSubtle)
    expect(flat(screen.getAllByText('GO')[1]!.props.style).color).toBe(color.textSubtle)
    // Pressing a dimmed GO (guard unlocked during blackout) stays low-light.
    // The composite pressables carry the style function; host views only hold its resolved idle result.
    const [opening, finale] = screen.UNSAFE_root.findAll((node) => typeof node.props.style === 'function' && typeof node.props.accessibilityLabel === 'string', { deep: true })
    expect(pressableStyle(finale!, true).backgroundColor).toBe(color.surface)
    expect(pressableStyle(opening!, true).backgroundColor).toBe(color.goPressed)
  })
})

describe('value slider and switch row', () => {
  it('stores clean stepped values instead of binary float noise', () => {
    const onChange = jest.fn()
    const screen = render(wrap(<ValueSlider label="Speed" value={1.1} min={0.7} max={2} step={0.05} onChange={onChange} />))
    fireEvent.press(screen.getByRole('button', { name: `${messages.en['common.increase']} · Speed` }))
    expect(onChange).toHaveBeenCalledWith(1.15)
  })
  it('toggles from anywhere on the row and leaves the switch as the single assistive control', () => {
    const onValueChange = jest.fn()
    const screen = render(wrap(<SwitchRow title="Loop" value={false} onValueChange={onValueChange} />))
    fireEvent.press(screen.getByText('Loop'))
    expect(onValueChange).toHaveBeenCalledWith(true)
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })
  it('does not toggle a disabled row', () => {
    const onValueChange = jest.fn()
    const screen = render(wrap(<SwitchRow title="Loop" value={false} disabled onValueChange={onValueChange} />))
    fireEvent.press(screen.getByText('Loop'))
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

describe('time formatting', () => {
  it('never renders NaN or Infinity clocks', () => {
    expect(formatTime(Number.NaN)).toBeNull()
    expect(formatTime(Number.POSITIVE_INFINITY)).toBeNull()
    expect(formatTime(-500)).toBe('00:00')
    expect(formatTime(61_000)).toBe('01:01')
  })
  it('rounds remaining time up so live audio never reads 00:00', () => {
    expect(formatTime(400, 'ceil')).toBe('00:01')
    expect(formatTime(179_600, 'ceil')).toBe('03:00')
    expect(formatTime(10_000, 'ceil')).toBe('00:10')
  })
})
