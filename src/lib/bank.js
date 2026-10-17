import nf from '../data/questions/nf.json' with { type: 'json' }
import na from '../data/questions/na.json' with { type: 'json' }
import ipc from '../data/questions/ipc.json' with { type: 'json' }
import ips from '../data/questions/ips.json' with { type: 'json' }
import sec from '../data/questions/sec.json' with { type: 'json' }
import auto from '../data/questions/auto.json' with { type: 'json' }
import objectives from '../data/objectives.json' with { type: 'json' }

/**
 * The single bank index.
 *
 * The six question files were previously concatenated in `Exam.jsx` and again,
 * independently, in `tests/rationale.test.js`. Two copies of the same rule drift:
 * a new domain file has to be added twice and the two lists can silently disagree.
 * Both now read from here.
 *
 * `BANK` keeps the literal `{ nf, na, ipc, ips, sec, auto }` order deliberately.
 * It is not cosmetic: `PracticeHome`'s progress record persists an integer index
 * into `byDomain(...)`, so a reader that sorted by difficulty or objective would
 * re-point every stored cursor at a different question on resume. The order is a
 * contract, pinned by `tests/bank.test.js` with a deep-equal assertion — a set
 * comparison would pass under any order and so could not catch it.
 */
const FILES = { nf, na, ipc, ips, sec, auto }

export const BANK = Object.values(FILES).flatMap((file) => file.questions)

export const BY_ID = new Map(BANK.map((q) => [q.id, q]))

/** Every question in one domain, in `BANK` order. Unsorted, by contract. */
export function byDomain(domainId) {
  return BANK.filter((q) => q.domain === domainId)
}

/**
 * Live per-domain counts, in the blueprint's domain order.
 *
 * These are actuals read from the loaded bank. They are not the v1 allocation
 * target in `bank.config.json`, which is a frozen plan of how many questions
 * each domain should eventually hold: NF 61, NA 58, IPC 71, IPS 31, SEC 50,
 * AUTO 29 = 300, against the 169 questions that exist today. `Home.jsx` used to
 * render those targets under the label "in bank"; the two disagree in both
 * directions (IPS is allocated 31 and holds 32), so neither number can stand in
 * for the other.
 */
export const counts = Object.fromEntries(
  objectives.domains.map((domain) => [domain.id, byDomain(domain.id).length])
)