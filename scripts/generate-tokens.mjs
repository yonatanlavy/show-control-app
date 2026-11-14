import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src', 'design', 'tokens.json')
const outputPath = path.join(root, 'src', 'design', 'tokens.native.ts')
const source = JSON.parse(await readFile(sourcePath, 'utf8'))

const value = (token) => {
  const raw = token.$value
  return raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw
}

const key = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name))
const rename = (name) => ({ '2xs': 'xxs', '2xl': 'xxl' })[name] ?? name
const literal = (token, section) => {
  const raw = value(token)
  if (section === 'weight') return JSON.stringify(String(raw))
  return typeof raw === 'string' ? JSON.stringify(raw) : String(raw)
}
const objectLine = (record, section) => Object.entries(record)
  .map(([name, token]) => `${key(rename(name))}: ${literal(token, section)}`)
  .join(', ')

const color = Object.entries(source.color)
  .map(([name, token]) => `  ${key(name)}: ${literal(token)},`)
  .join('\n')
const space = Object.entries(source.space)
  .map(([name, token]) => `  ${key(rename(name))}: ${literal(token)},`)
  .join('\n')
const size = Object.entries(source.size)
  .map(([name, token]) => `  ${key(name)}: ${literal(token)},`)
  .join('\n')

const generated = `/**
 * Generated from tokens.json. Do not add feature-level values here.
 * Hallmark · genre: atmospheric · macrostructure: Workbench · theme: Midnight
 * Hallmark pre-emit critique: P5 H5 E4 S5 R5 V5
 */

export const color = {
${color}
} as const

export const space = {
${space}
} as const

export const size = {
${size}
} as const

export const radius = { ${objectLine(source.radius)} } as const

export const font = {
  family: { ${objectLine(source.font.family)} },
  size: { ${objectLine(source.font.size)} },
  lineHeight: { ${objectLine(source.font.lineHeight)} },
  scale: { ${objectLine(source.font.scale)} },
  weight: { ${objectLine(source.font.weight, 'weight')} },
} as const

export const motion = { ${objectLine(source.motion)} } as const
export const opacity = { ${objectLine(source.opacity)} } as const

export const tokens = { color, space, size, radius, font, motion, opacity } as const
export type Tokens = typeof tokens
`

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8')
  if (current.replaceAll('\r\n', '\n') !== generated) {
    console.error('tokens.native.ts is stale. Run pnpm generate:tokens.')
    process.exitCode = 1
  }
} else {
  await writeFile(outputPath, generated, 'utf8')
  console.log('Generated src/design/tokens.native.ts')
}
