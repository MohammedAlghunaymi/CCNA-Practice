import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BEGIN,
  END,
  REMEDY_MISSING,
  REMEDY_MARKERS,
  assessDocs,
  writeDocs,
  renderAppendix,
  renderNotEmulated,
} from '../src/lib/docs.js'
import objectives from '../src/data/objectives.json' with { type: 'json' }
import notEmulated from '../src/data/not-emulated.json' with { type: 'json' }

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHELL = join(REPO, 'scripts/generate-docs.mjs')

/**
 * A complete scratch copy of the two data files and the two generated documents.
 *
 * Built from the committed files so the default fixture is byte-exact and every
 * drift is a deliberate edit, which is what makes test 2's precondition meaningful.
 */
function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ccna-docs-'))
  mkdirSync(join(root, 'src/data'), { recursive: true })
  mkdirSync(join(root, 'docs'), { recursive: true })
  copyFileSync(join(REPO, 'src/data/objectives.json'), join(root, 'src/data/objectives.json'))
  copyFileSync(join(REPO, 'src/data/not-emulated.json'), join(root, 'src/data/not-emulated.json'))
  copyFileSync(join(REPO, 'docs/PROJECT.md'), join(root, 'docs/PROJECT.md'))
  copyFileSync(join(REPO, 'docs/NOT-EMULATED.md'), join(root, 'docs/NOT-EMULATED.md'))
  return root
}

const roots = []
beforeEach(() => {
  roots.length = 0
})
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = makeRoot()
  roots.push(root)
  return root
}

const read = (root, file) => readFileSync(join(root, file), 'utf8')
const put = (root, file, text) => writeFileSync(join(root, file), text, 'utf8')

/** Both generated documents, as one comparable object. Missing files read as null. */
function snapshot(root) {
  const at = (file) =>
    existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null
  return {
    'docs/NOT-EMULATED.md': at('docs/NOT-EMULATED.md'),
    'docs/PROJECT.md': at('docs/PROJECT.md'),
  }
}

/** Drift one document's content without touching its markers. */
function driftNotEmulated(root) {
  put(root, 'docs/NOT-EMULATED.md', read(root, 'docs/NOT-EMULATED.md').replace('# Emulator gaps', '# Emulator holes'))
}
function driftAppendix(root) {
  const project = read(root, 'docs/PROJECT.md')
  const start = project.indexOf(BEGIN)
  put(root, 'docs/PROJECT.md', project.slice(0, start) + project.slice(start).replace('## Appendix:', '## Appendix (drifted):'))
}

const assess = (root) => assessDocs({ root, objectives, notEmulated })
const only = (findings, file) => findings.filter((f) => f.file === file)

/** Spawn the repository's own shell, so DOCS_ROOT is genuinely exercised. */
function spawnShell(root, args = []) {
  return spawnSync(process.execPath, [SHELL, ...args], {
    env: { ...process.env, DOCS_ROOT: root },
    encoding: 'utf8',
  })
}

describe('the five staleness rows', () => {
  it('classifies every row, with content present exactly when regenerable', () => {
    const cases = [
      { name: 'NOT-EMULATED absent', kind: 'regenerable', hasContent: true },
      { name: 'NOT-EMULATED drifted', kind: 'regenerable', hasContent: true },
      { name: 'PROJECT absent', kind: 'manual', hasContent: false },
      { name: 'PROJECT markers stripped', kind: 'manual', hasContent: false },
      { name: 'PROJECT appendix drifted', kind: 'regenerable', hasContent: true },
    ]

    for (const [i, expected] of cases.entries()) {
      const root = fixture()
      // Start from a tree where the sibling document is current, so each row
      // yields exactly one finding. `:74` is the exception and is handled below.
      if (i === 0) rmSync(join(root, 'docs/NOT-EMULATED.md'))
      if (i === 1) driftNotEmulated(root)
      if (i === 2) rmSync(join(root, 'docs/PROJECT.md'))
      if (i === 3) put(root, 'docs/PROJECT.md', read(root, 'docs/PROJECT.md').replace(BEGIN, '').replace(END, ''))
      if (i === 4) driftAppendix(root)

      const finding = only(assess(root), i < 2 ? 'docs/NOT-EMULATED.md' : 'docs/PROJECT.md')
      expect(finding, expected.name).toHaveLength(1)
      expect(finding[0].kind, expected.name).toBe(expected.kind)
      expect(finding[0].content !== undefined, `${expected.name} content presence`).toBe(expected.hasContent)
      if (expected.hasContent) expect(finding[0].content.length).toBeGreaterThan(0)
      else expect(finding[0].remedy).toMatch(/restore|re-insert/)
    }
  })

  it('creates docs/ when it is absent, rather than throwing ENOENT', () => {
    // Removing only the file would leave a directory with nothing to write into
    // the error path: writeFileSync would have no ENOENT to raise, and the
    // mkdirSync requirement would go untested.
    const root = fixture()
    rmSync(join(root, 'docs'), { recursive: true })

    const findings = assess(root)
    expect(only(findings, 'docs/NOT-EMULATED.md')).toHaveLength(1)
    expect(writeDocs(findings, { root })).toHaveLength(1)
    expect(existsSync(join(root, 'docs/NOT-EMULATED.md'))).toBe(true)
    // The sibling is manual and must not be conjured out of nothing.
    expect(existsSync(join(root, 'docs/PROJECT.md'))).toBe(false)
  })
})

describe('the regression assertion', () => {
  it('leaves both files untouched while assessing, then repairs both', () => {
    const root = fixture()
    driftNotEmulated(root)
    driftAppendix(root)

    const before = snapshot(root)

    const findings = assess(root)

    // PRECONDITION, byte equality. A sentinel `.not.toContain` would be
    // trivially true of any implementation, including an `assessDocs` that
    // silently repairs what it was asked to check.
    expect(snapshot(root)).toEqual(before)

    const written = writeDocs(findings, { root })
    expect(written.map((f) => f.file).sort()).toEqual([
      'docs/NOT-EMULATED.md',
      'docs/PROJECT.md',
    ])

    expect(assess(root)).toEqual([])
  })

  it('refuses to write without an explicit root', () => {
    const root = fixture()
    driftNotEmulated(root)
    const findings = assess(root)
    // A default of process.cwd() would let a test that forgot the argument
    // write into the real repository.
    expect(() => writeDocs(findings, {})).toThrow()
  })
})

describe('content is the whole file', () => {
  it('preserves the hand-authored prefix byte-identically', () => {
    const root = fixture()
    const projectBefore = read(root, 'docs/PROJECT.md')
    const prefixBefore = projectBefore.slice(0, projectBefore.indexOf(BEGIN))

    driftAppendix(root)
    writeDocs(assess(root), { root })

    const projectAfter = read(root, 'docs/PROJECT.md')
    expect(projectAfter.slice(0, projectAfter.indexOf(BEGIN))).toBe(prefixBefore)
    expect(assess(root)).toEqual([])
  })

  it('writes the appendix, not the block, so the document is never truncated', () => {
    const root = fixture()
    driftAppendix(root)
    const project = read(root, 'docs/PROJECT.md')
    const [finding] = only(assess(root), 'docs/PROJECT.md')

    // Writing the BEGIN..END block to the path would leave a file that still
    // contains both markers, so --check would call it clean while 32,133
    // hand-authored characters were gone.
    expect(finding.content).not.toBe(renderAppendix(objectives))
    expect(finding.content.startsWith(project.slice(0, project.indexOf(BEGIN)))).toBe(true)
    expect(finding.content.endsWith(END)).toBe(true)
  })
})

describe('manual findings', () => {
  it('carries a pinned remedy, no content, and writes nothing', () => {
    const root = fixture()
    rmSync(join(root, 'docs/PROJECT.md'))

    const [finding] = only(assess(root), 'docs/PROJECT.md')
    expect(finding.kind).toBe('manual')
    expect(finding.content).toBeUndefined()
    expect(finding.remedy).toBe(REMEDY_MISSING)

    expect(writeDocs(assess(root), { root })).toEqual([])
    expect(existsSync(join(root, 'docs/PROJECT.md'))).toBe(false)
  })

  it('names the marker insertion when the markers are gone', () => {
    const root = fixture()
    put(root, 'docs/PROJECT.md', read(root, 'docs/PROJECT.md').split(BEGIN).join('').split(END).join(''))
    const [finding] = only(assess(root), 'docs/PROJECT.md')
    expect(finding.kind).toBe('manual')
    expect(finding.remedy).toBe(REMEDY_MARKERS)
  })

  it('never carries an empty remedy', () => {
    const root = fixture()
    rmSync(join(root, 'docs/PROJECT.md'))
    put(root, 'docs/PROJECT.md', '# recovered')
    for (const finding of only(assess(root), 'docs/PROJECT.md')) {
      expect(finding.remedy).toBeTruthy()
    }
  })
})

describe('sources are injected', () => {
  const fixtureObjectives = {
    ...objectives,
    domains: [
      {
        ...objectives.domains[0],
        name: 'Fixture Domain',
        objectives: [
          { id: 'FX.1.1', description: 'FIXTURE DESCRIPTION ONE', isLeaf: true },
        ],
      },
    ],
  }
  const fixtureNotEmulated = {
    ...notEmulated,
    meta: { ...notEmulated.meta, principle: 'FIXTURE PRINCIPLE' },
  }

  it('renders fixture data and not the repository data', () => {
    // Asserted on the RENDERERS, never on `content`. Contract 2 requires
    // `content` to be the whole file, which necessarily contains the
    // hand-authored prefix and its real domain names - so "content lacks the
    // real header" would be unsatisfiable, and the nearest fix to a red test is
    // writing only the block, which is the destruction contract 2 prevents.
    const block = renderAppendix(fixtureObjectives)
    expect(block).toContain('FX.1.1')
    expect(block).toContain('FIXTURE DESCRIPTION ONE')
    expect(block).not.toContain('Network Fundamentals')

    const gaps = renderNotEmulated(fixtureNotEmulated)
    expect(gaps).toContain('FIXTURE PRINCIPLE')
    expect(gaps).not.toContain(notEmulated.meta.principle)
  })

  it('writes a fixture render over the real document, and it is not empty', () => {
    const root = fixture()
    const findings = assessDocs({
      root,
      objectives: fixtureObjectives,
      notEmulated: fixtureNotEmulated,
    })
    // Both documents now differ from their fixture sources.
    expect(findings.map((f) => f.file).sort()).toEqual([
      'docs/NOT-EMULATED.md',
      'docs/PROJECT.md',
    ])
    writeDocs(findings, { root })
    // A renderer returning '' would truncate the file to zero bytes while
    // --check stayed green.
    expect(read(root, 'docs/NOT-EMULATED.md').length).toBeGreaterThan(0)
    expect(read(root, 'docs/NOT-EMULATED.md')).toContain('FIXTURE PRINCIPLE')
  })
})

describe('a current tree produces nothing', () => {
  it('is empty', () => {
    expect(assess(fixture())).toEqual([])
  })
})

describe('trailing whitespace is staleness', () => {
  it('treats appended whitespace on NOT-EMULATED.md as regenerable', () => {
    const root = fixture()
    put(root, 'docs/NOT-EMULATED.md', read(root, 'docs/NOT-EMULATED.md') + '\n   \n')
    const [finding] = only(assess(root), 'docs/NOT-EMULATED.md')
    expect(finding).toBeTruthy()
    expect(finding.kind).toBe('regenerable')
    // Repairing removes it, byte-exactly.
    writeDocs(assess(root), { root })
    expect(read(root, 'docs/NOT-EMULATED.md')).not.toMatch(/\n {3}\n$/)
  })

  it('treats interior drift in the appendix as regenerable', () => {
    // This is a splice and interior-drift case. It does NOT pin byte-exactness:
    // the appendix block always ends with END, whose last character is `>`, so
    // `.trimEnd()` there is a provable no-op that no fixture can distinguish.
    // `docs.js` forbidding `.trimEnd(` is what holds that half - see below.
    const root = fixture()
    driftAppendix(root)
    const [finding] = only(assess(root), 'docs/PROJECT.md')
    expect(finding.kind).toBe('regenerable')
  })
})

describe('the shell', () => {
  it('prints MANUAL FIX and not the generator remedy for a manual finding', () => {
    const root = fixture()
    rmSync(join(root, 'docs/PROJECT.md'))

    const before = snapshot(root)
    const run = spawnShell(root, ['--check'])

    expect(run.stderr).toContain('MANUAL FIX: ' + REMEDY_MISSING)
    expect(run.stderr).not.toMatch(/Fix with:/)
    expect(run.status).toBe(1)
    // --check must not repair what it checks, or the second run would pass.
    expect(snapshot(root)).toEqual(before)
  })

  it('prints the generator remedy and writes nothing for a stale NOT-EMULATED', () => {
    const root = fixture()
    driftNotEmulated(root)

    const before = snapshot(root)
    const run = spawnShell(root, ['--check'])

    expect(run.stderr).toContain('Fix with: npm run docs:generate')
    expect(run.status).toBe(1)
    expect(snapshot(root)).toEqual(before)
  })

  it('prints the generator remedy and writes nothing for a stale appendix', () => {
    // The half that a `--check` writing only PROJECT.md survives, and which
    // made `validate:docs` report 3/3 on its second run.
    const root = fixture()
    driftAppendix(root)

    const before = snapshot(root)
    const run = spawnShell(root, ['--check'])

    expect(run.stderr).toContain('Fix with: npm run docs:generate')
    expect(run.status).toBe(1)
    expect(snapshot(root)).toEqual(before)
  })

  it('passes on a clean tree', () => {
    const root = fixture()
    const run = spawnShell(root, ['--check'])
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('OK')
  })

  it('write mode names only what it wrote', () => {
    const root = fixture()
    driftNotEmulated(root)

    const run = spawnShell(root)
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('updated: docs/NOT-EMULATED.md')
    expect(run.stdout).not.toContain('docs/PROJECT.md')
    expect(run.stdout).not.toContain('already up to date')
    expect(assess(root)).toEqual([])
  })

  it('write mode does not claim success while a manual finding stands', () => {
    const root = fixture()
    rmSync(join(root, 'docs/PROJECT.md'))

    const run = spawnShell(root)
    // The old code printed `updated: docs/PROJECT.md is missing` and wrote
    // nothing. Reporting it as updated is the defect, not the phrasing.
    expect(run.stdout).not.toContain('updated: docs/PROJECT.md')
    expect(run.stdout).not.toContain('already up to date')
    expect(run.stdout).toContain('MANUAL FIX: docs/PROJECT.md - ' + REMEDY_MISSING)
  })
})

describe('docs.js forbids trimEnd', () => {
  /**
   * Strip comments without a `//.*$` regex, which would delete the rest of any
   * line whose string literal contains `//`.
   */
  function stripComments(source) {
    let out = ''
    let i = 0
    while (i < source.length) {
      const two = source.slice(i, i + 2)
      if (two === '//') {
        while (i < source.length && source[i] !== '\n') i += 1
      } else if (two === '/*') {
        i += 2
        while (i < source.length && source.slice(i, i + 2) !== '*/') i += 1
        i += 2
      } else if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
        const quote = source[i]
        out += source[i]
        i += 1
        while (i < source.length && source[i] !== quote) {
          if (source[i] === '\\') {
            out += source.slice(i, i + 2)
            i += 2
          } else {
            out += source[i]
            i += 1
          }
        }
        out += source[i]
        i += 1
      } else {
        out += source[i]
        i += 1
      }
    }
    return out
  }

  it('self-tests its own stripper', () => {
    // A comment naming trimEnd is ignored; a string literal naming it is not.
    expect(stripComments('// trimEnd()\nconst a = 1')).not.toContain('trimEnd')
    expect(stripComments('const s = "trimEnd"')).toContain('trimEnd')
    expect(stripComments('const s = "http://x" // trailing')).toContain('http://x')
  })

  it('contains no trimEnd outside comments', () => {
    const source = stripComments(readFileSync(join(REPO, 'src/lib/docs.js'), 'utf8'))
    expect(source).not.toContain('trimEnd')
  })
})