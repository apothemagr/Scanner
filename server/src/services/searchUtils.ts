// Greeklish → Greek conversion + tokenization helpers για αναζήτηση προϊόντων.

const DIGRAPHS: Array<[RegExp, string]> = [
  [/ou/gi, 'ου'],
  [/ai/gi, 'αι'],
  [/ei/gi, 'ει'],
  [/oi/gi, 'οι'],
  [/au/gi, 'αυ'],
  [/eu/gi, 'ευ'],
  [/th/gi, 'θ'],
  [/ch/gi, 'χ'],
  [/ps/gi, 'ψ'],
  [/ks/gi, 'ξ'],
  [/mp/gi, 'μπ'],
  [/nt/gi, 'ντ'],
  [/gk/gi, 'γκ'],
  [/gg/gi, 'γγ'],
  [/tz/gi, 'τζ'],
  [/ts/gi, 'τσ'],
]

const SINGLES: Record<string, string> = {
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η',
  i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', x: 'ξ', o: 'ο',
  p: 'π', r: 'ρ', s: 'σ', t: 'τ', y: 'υ', u: 'υ', f: 'φ',
  c: 'κ', j: 'ι', q: 'κ', v: 'β', w: 'ω',
}

// Επιστρέφει greeklish → ελληνικό string. Αν δεν περιέχει Latin γράμματα, επιστρέφει ως έχει.
export function greeklishToGreek(input: string): string {
  if (!input) return ''
  if (!/[a-zA-Z]/.test(input)) return input
  let s = input
  for (const [re, rep] of DIGRAPHS) s = s.replace(re, rep)
  let out = ''
  for (const ch of s) {
    const lower = ch.toLowerCase()
    if (SINGLES[lower]) {
      out += SINGLES[lower]
    } else {
      out += ch
    }
  }
  // τελικό σ → ς αν είναι στο τέλος λέξης
  out = out.replace(/σ(?=\s|$|[^Ͱ-Ͽἀ-῿])/g, 'ς')
  return out
}

// Σπάει το query σε tokens (whitespace), αγνοεί κενά. Επιστρέφει originals + greeklish-converted εκδοχές.
// Κάθε token θα γίνει AND clause, έτσι "σαμπουαν λοκαλ" ταιριάζει και με "Λοκάλ Σαμπουάν 200ml".
export function tokenize(q: string): string[] {
  return (q || '')
    .trim()
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

// Για κάθε token δημιουργεί μια λίστα variants (original, greeklish→greek). Διπλότυπα αφαιρούνται.
export function tokenVariants(token: string): string[] {
  const variants = new Set<string>()
  variants.add(token)
  const greek = greeklishToGreek(token)
  if (greek && greek !== token) variants.add(greek)
  return Array.from(variants)
}
