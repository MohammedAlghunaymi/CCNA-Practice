import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8')

/**
 * The favicon reference resolves.
 *
 * Parsed with JSDOM rather than pattern-matched. A regex over the raw source
 * would happily match a `<link rel="icon">` sitting inside an HTML comment,
 * which is exactly how a reference can look present in a diff and be absent from
 * the document. `link[rel~="icon"]` only matches a real element.
 */
describe('favicon', () => {
  it('index.html declares exactly one icon link', () => {
    const { document } = new JSDOM(indexHtml).window
    const icons = document.querySelectorAll('link[rel~="icon"]')
    expect(icons).toHaveLength(1)
  })

  it('the icon href points at a file that exists in public/', () => {
    const { document } = new JSDOM(indexHtml).window
    const href = document.querySelector('link[rel~="icon"]').getAttribute('href')

    expect(href).toBeTruthy()
    // Root-absolute, because Vite serves public/ at the site root.
    expect(href.startsWith('/')).toBe(true)

    const target = join(ROOT, 'public', href.replace(/^\/+/, ''))
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(target, 'utf8')).toContain('<svg')
  })

  it('is not a preload or a prefetch standing in for an icon', () => {
    // The weaker claim "index.html references it" is satisfied by any tag at
    // all. This one names the role.
    const { document } = new JSDOM(indexHtml).window
    const link = document.querySelector('link[rel~="icon"]')
    expect(link.getAttribute('rel')).toContain('icon')
  })
})