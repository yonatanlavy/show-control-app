import { parseSeconds } from '../timing'
import { operationErrorKey } from '../feedback'

describe('portable exact timing entry', () => {
  it.each(['Image cannot be decoded', 'Unsupported video', "Call to function 'ShowVisual.probeVisual' has been rejected: setDataSource failed"])('gives visual-file guidance rather than audio instructions for %s', (error) => {
    expect(operationErrorKey(error)).toBe('error.visualUnreadable')
  })
  it.each(['0.053', '0,053', '٠٫٠٥٣', '۰٫۰۵۳', ' .053 '])('preserves millisecond precision for %s', (text) => {
    expect(parseSeconds(text)).toBe(53)
  })
  it.each(['', ' ', '.', '1.', '0.0001', '-1', '+1', '1e3', 'NaN', 'Infinity', '1,2.3', '1٬000', '9007199254740991'])('rejects ambiguous or unsafe input %s', (text) => {
    expect(parseSeconds(text)).toBeNull()
  })
  it('gives useful messages for actual file-size and free-storage failures', () => {
    expect(operationErrorKey('Declared file size is invalid')).toBe('error.mediaSize')
    expect(operationErrorKey('Media is empty or its file size is invalid.')).toBe('error.mediaSize')
    expect(operationErrorKey('Not enough free storage to complete this operation safely.')).toBe('error.lowStorage')
    expect(operationErrorKey('Backup SHA-256 checksum mismatch.')).toBe('error.backupInvalid')
  })
})
