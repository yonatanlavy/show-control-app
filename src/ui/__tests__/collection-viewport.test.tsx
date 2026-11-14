import { useState } from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { Button, Keyboard, KeyboardAvoidingView, Platform, SectionList, Text, TextInput, View } from 'react-native'
import { SafeAreaInsetsContext } from 'react-native-safe-area-context'
import { CollectionViewport, type CollectionSection } from '../CollectionViewport'
import { KeyboardAvoidanceContext } from '../keyboard-avoidance'

function StatefulHeader() {
  const [draft, setDraft] = useState('')
  return <TextInput accessibilityLabel="Find a row" value={draft} onChangeText={setDraft} />
}
function StatefulFooter() {
  const [expanded, setExpanded] = useState(false)
  return <View><Button title="Details" onPress={() => setExpanded(!expanded)} />{expanded ? <Text>Retained details</Text> : null}</View>
}
type Item = { id: string; name: string }
const items = Array.from({ length: 2000 }, (_, index) => ({ id: `row-${index}`, name: `Row ${index}` }))
const sections: readonly CollectionSection<Item>[] = [{ key: 'songs', data: items, heading: <Text>Songs</Text> }]

it('windows the actual native SectionList while keeping every item in its source data', () => {
  const screen = render(<CollectionViewport sections={sections} header={<StatefulHeader />} footer={<StatefulFooter />} resetKey="all" scopeKey="fixture"
    keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} />)
  const list = screen.UNSAFE_getByType(SectionList)
  expect(list.props.sections[0].data).toHaveLength(2000)
  expect(list.props.sections[0].data.at(-1)).toEqual(items.at(-1))
  expect(screen.getAllByText(/^Row \d+$/).length).toBeLessThan(20)
  expect(screen.queryByText('Row 1999')).toBeNull()
  expect(list.props.stickySectionHeadersEnabled).toBe(false)
  expect(list.props.removeClippedSubviews).toBe(false)
})

it('retains header input and footer disclosure state through filtering, empty results and section replacement', () => {
  const content = (data: readonly CollectionSection<Item>[], key: string) => <CollectionViewport sections={data} header={<StatefulHeader />} footer={<StatefulFooter />}
    resetKey={key} scopeKey="fixture" keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} />
  const screen = render(content(sections, 'all'))
  const input = screen.getByLabelText('Find a row')
  fireEvent.changeText(input, 'kept draft')
  fireEvent.press(screen.getByText('Details'))
  screen.rerender(content([{ key: 'hits', data: [items[1999]!] }], 'far result'))
  expect(screen.getByText('Row 1999')).toBeTruthy()
  expect(screen.getByLabelText('Find a row')).toBe(input)
  expect(input.props.value).toBe('kept draft')
  expect(screen.getByText('Retained details')).toBeTruthy()
  screen.rerender(content([], 'empty'))
  expect(screen.getByLabelText('Find a row')).toBe(input)
  expect(input.props.value).toBe('kept draft')
  expect(screen.getByText('Retained details')).toBeTruthy()
})

it('keeps repeated cue identities in main and Hits separate', () => {
  const selected = jest.fn()
  const screen = render(<CollectionViewport sections={[{ key: 'songs', data: [items[0]!] }, { key: 'hits', data: [items[0]!] }]}
    header={<Text>Header</Text>} footer={<Text>Footer</Text>} resetKey="same cue" scopeKey="fixture" keyExtractor={(item) => item.id}
    renderItem={(item, _index, sectionKey) => <Button title={sectionKey + ': ' + item.name} onPress={() => selected(sectionKey, item.id)} />} />)
  fireEvent.press(screen.getByText('songs: Row 0'))
  fireEvent.press(screen.getByText('hits: Row 0'))
  expect(selected.mock.calls).toEqual([['songs', 'row-0'], ['hits', 'row-0']])
})

it('resets the native viewport without animation only for an intentional scope/query change', () => {
  const scrollTo = jest.fn()
  const responder = jest.spyOn(SectionList.prototype, 'getScrollResponder').mockReturnValue({ scrollTo } as unknown as ReturnType<SectionList<Item>['getScrollResponder']>)
  try {
    const content = (resetKey: string) => <CollectionViewport sections={sections} header={<Text>Header</Text>} footer={<Text>Footer</Text>}
      resetKey={resetKey} scopeKey="fixture" keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} />
    const screen = render(content('show A'))
    expect(scrollTo).not.toHaveBeenCalled()
    screen.rerender(content('show A'))
    expect(scrollTo).not.toHaveBeenCalled()
    screen.rerender(content('show B'))
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: false })
  } finally { responder.mockRestore() }
})

it('anchors query edits and clearing to the measured search while a new scope starts at its heading', () => {
  const scrollTo = jest.fn(), readOffset = jest.fn(() => 420)
  const responder = jest.spyOn(SectionList.prototype, 'getScrollResponder').mockReturnValue({ scrollTo } as unknown as ReturnType<SectionList<Item>['getScrollResponder']>)
  try {
    const content = (resetKey: string, scopeKey = 'playlist A') => <CollectionViewport sections={sections} header={<StatefulHeader />} footer={<Text>Footer</Text>}
      resetKey={resetKey} scopeKey={scopeKey} getResetOffset={readOffset} keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} />
    const screen = render(content(''))
    screen.rerender(content('finale'))
    screen.rerender(content(''))
    screen.rerender(content('', 'playlist B'))
    expect(scrollTo.mock.calls).toEqual([[{ x: 0, y: 420, animated: false }], [{ x: 0, y: 420, animated: false }], [{ x: 0, y: 0, animated: false }]])
    expect(readOffset).toHaveBeenCalledTimes(2)
  } finally { responder.mockRestore() }
})

it.each([NaN, Infinity, -50])('does not dispatch an invalid native scroll offset: %s', (offset) => {
  const scrollTo = jest.fn()
  const responder = jest.spyOn(SectionList.prototype, 'getScrollResponder').mockReturnValue({ scrollTo } as unknown as ReturnType<SectionList<Item>['getScrollResponder']>)
  try {
    const content = (resetKey: string) => <CollectionViewport sections={sections} header={<Text>Header</Text>} footer={<Text>Footer</Text>}
      resetKey={resetKey} scopeKey="fixture" getResetOffset={() => offset} keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} />
    const screen = render(content(''))
    screen.rerender(content('new query'))
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 0, animated: false })
  } finally { responder.mockRestore() }
})

it.each([['android', 'height'], ['ios', 'padding']] as const)('uses keyboard avoidance and the actual safe-area offset on %s', (platform, behavior) => {
  const replacement = jest.replaceProperty(Platform, 'OS', platform)
  try {
    const screen = render(<SafeAreaInsetsContext.Provider value={{ top: 24, bottom: 0, left: 0, right: 0 }}><CollectionViewport sections={sections}
      header={<Text>Header</Text>} footer={<Text>Footer</Text>} resetKey="" scopeKey="fixture" keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} /></SafeAreaInsetsContext.Provider>)
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props).toMatchObject({ enabled: true, behavior, keyboardVerticalOffset: 24 })
  } finally { replacement.restore() }
})

it('defers keyboard avoidance to an enclosing shell instead of shrinking the list twice', () => {
  const screen = render(<KeyboardAvoidanceContext.Provider value><CollectionViewport sections={sections}
    header={<Text>Header</Text>} footer={<Text>Footer</Text>} resetKey="" scopeKey="fixture" keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} /></KeyboardAvoidanceContext.Provider>)
  expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.enabled).toBe(false)
  expect(screen.UNSAFE_getByType(SectionList)).toBeTruthy()
})

it('repositions a fast query after keyboard resize but preserves position for feedback, hidden layouts and empty queries', () => {
  const scrollTo = jest.fn()
  const responder = jest.spyOn(SectionList.prototype, 'getScrollResponder').mockReturnValue({ scrollTo } as unknown as ReturnType<SectionList<Item>['getScrollResponder']>)
  const keyboard = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(true)
  try {
    const content = (query: string) => <CollectionViewport sections={sections} header={<Text>Header</Text>} footer={<Text>Footer</Text>}
      resetKey={query} scopeKey="fixture" getResetOffset={() => 420} keyExtractor={(item) => item.id} renderItem={(item) => <Text>{item.name}</Text>} />
    const screen = render(content('last song'))
    const layout = (height: number) => fireEvent(screen.UNSAFE_getByType(SectionList), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height } } })
    layout(700); layout(400)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({ x: 0, y: 420, animated: false })
    keyboard.mockReturnValue(false); layout(300)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    keyboard.mockReturnValue(true); layout(0)
    expect(scrollTo).toHaveBeenCalledTimes(1)
    screen.rerender(content('')); scrollTo.mockClear(); layout(500); layout(200)
    expect(scrollTo).not.toHaveBeenCalled()
  } finally { keyboard.mockRestore(); responder.mockRestore() }
})
