import type { ControllerBinding } from '../domain'
import type { MessageKey } from '../i18n'

type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string
type InputIdentity = Pick<ControllerBinding, 'inputKey' | 'adapterId' | 'deviceId'>

// Substitute once: opaque identifiers and target names may contain braces or
// replacement-string characters, which must remain literal in the final label.
function formatControllerLabel(t: Translate, key: MessageKey, params: Readonly<Record<string, string>>) {
  return t(key).replace(/\{(\w+)\}/g, (placeholder, name: string) => params[name] ?? placeholder)
}

/** Presentation only: retain the exact identity used by native binding matching. */
export function controllerInputLabel(input: InputIdentity, t: Translate) {
  const format = (key: MessageKey, params: Readonly<Record<string, string>>) => formatControllerLabel(t, key, params)
  const isolate = (value: string) => `\u2066${value}\u2069`
  const button = format('remote.button', { key: isolate(input.inputKey) })
  const adapter = input.adapterId === undefined ? t('remote.anyAdapter') : isolate(input.adapterId)
  const device = input.deviceId === undefined ? t('remote.anyDevice') : isolate(input.deviceId)
  let source = format('remote.bindingSource', { adapter, device })
  const scope = input.adapterId === 'unbound' ? t('remote.needsRebinding')
    : input.adapterId === 'system-media' ? t('remote.sharedMediaIdentity')
      : input.adapterId === 'generic-native' && input.deviceId === 'keyboard-coalesced' ? t('remote.sharedKeyboardIdentity') : undefined
  if (scope) source = format('remote.bindingScopedSource', { scope, source })
  return { button, source, full: format('remote.bindingIdentity', { button, source }) }
}

export function controllerRemovalLabel(input: InputIdentity, action: string, t: Translate): string {
  return formatControllerLabel(t, 'remote.removeBinding', { action, button: controllerInputLabel(input, t).full })
}
