import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useEffect } from 'react';
import { sampleShow } from '../../domain';
import { I18nProvider } from '../../i18n';
import { DEFAULT_LIBRARY_SETTINGS, type LibrarySnapshot } from '../../library/types';
import { AppProvider, useApp } from '../AppProvider';

let mockListener: () => void = () => undefined;
let mockSnapshot: LibrarySnapshot;
let toggle: (key: string) => void;
jest.mock('../../library', () => ({ createLibraryStore: () => ({
  getSnapshot: () => mockSnapshot,
  subscribe: (listener: () => void) => { mockListener = listener; return () => undefined; },
  initialize: async () => undefined,
}) }));
jest.mock('../../audio', () => ({ ...jest.requireActual('../../audio'), resolveNativeAudioEngine: () => ({ available: false, reason: 'Test has no native audio' }) }));
function Probe() { const app = useApp(); useEffect(() => { toggle = app.toggleCheck; }, [app.toggleCheck]); return <Text testID="checks">{JSON.stringify(app.checks)}</Text>; }
function baseSnapshot(): LibrarySnapshot { return { status: 'ready', saving: false, shows: [sampleShow], controllerProfiles: [], selectedShowId: sampleShow.id, selectedSetId: sampleShow.sets[0]!.id, settings: DEFAULT_LIBRARY_SETTINGS }; }

describe('preflight confirmations', () => {
  beforeEach(() => { mockSnapshot = baseSnapshot(); });
  it('accumulates rapid confirmations before a rerender', async () => {
    const screen = render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>);
    await act(async () => { toggle('local'); toggle('readable'); toggle('order'); });
    expect(JSON.parse(screen.getByTestId('checks').props.children)).toMatchObject({ local: true, readable: true, order: true });
    await act(async () => { toggle('local'); toggle('local'); });
    expect(JSON.parse(screen.getByTestId('checks').props.children).local).toBe(true);
  });
  it('invalidates confirmations when the show revision or playlist changes', async () => {
    const screen = render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>);
    await act(async () => { toggle('local'); toggle('order'); });
    await act(async () => { mockSnapshot = { ...mockSnapshot, shows: [{ ...sampleShow, revisionId: 'changed' }] }; mockListener(); });
    expect(JSON.parse(screen.getByTestId('checks').props.children)).toMatchObject({ local: false, order: false });
    await act(async () => { toggle('readable'); toggle('output'); });
    expect(JSON.parse(screen.getByTestId('checks').props.children)).toMatchObject({ readable: true, output: true, local: false });
    await act(async () => { mockSnapshot = { ...mockSnapshot, selectedSetId: 'another', shows: [{ ...sampleShow, revisionId: 'changed', sets: [...sampleShow.sets, { ...sampleShow.sets[0]!, id: 'another' }] }] }; mockListener(); });
    expect(Object.values(JSON.parse(screen.getByTestId('checks').props.children))).not.toContain(true);
  });
  it('does not transfer confirmations between same-named shows even when revision and playlist identities match', async () => {
    const copy = { ...sampleShow, id: 'same-named-copy' };
    mockSnapshot = { ...baseSnapshot(), shows: [sampleShow, copy] };
    const screen = render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>);
    await act(async () => { toggle('local'); toggle('readable'); toggle('order'); });
    expect(JSON.parse(screen.getByTestId('checks').props.children)).toMatchObject({ local: true, readable: true, order: true });
    await act(async () => { mockSnapshot = { ...mockSnapshot, selectedShowId: copy.id }; mockListener(); });
    expect(Object.values(JSON.parse(screen.getByTestId('checks').props.children))).not.toContain(true);
    await act(async () => { toggle('local'); });
    expect(JSON.parse(screen.getByTestId('checks').props.children)).toMatchObject({ local: true, readable: false, order: false });
    await act(async () => { mockSnapshot = { ...mockSnapshot, selectedShowId: sampleShow.id }; mockListener(); });
    expect(Object.values(JSON.parse(screen.getByTestId('checks').props.children))).not.toContain(true);
  });
  it('does not transfer confirmations between delimiter-colliding legacy identity tuples', async () => {
    const sharedSet = { ...sampleShow.sets[0]!, id: 'set' };
    const first = { ...sampleShow, id: 'show:a', revisionId: 'rev', sets: [sharedSet] };
    const second = { ...sampleShow, id: 'show', revisionId: 'a:rev', sets: [sharedSet] };
    mockSnapshot = { ...baseSnapshot(), shows: [first, second], selectedShowId: first.id, selectedSetId: sharedSet.id };
    const screen = render(<I18nProvider><AppProvider><Probe /></AppProvider></I18nProvider>);
    await act(async () => { toggle('local'); toggle('readable'); toggle('order'); });
    expect(JSON.parse(screen.getByTestId('checks').props.children)).toMatchObject({ local: true, readable: true, order: true });
    await act(async () => { mockSnapshot = { ...mockSnapshot, selectedShowId: second.id }; mockListener(); });
    expect(Object.values(JSON.parse(screen.getByTestId('checks').props.children))).not.toContain(true);
  });
});
