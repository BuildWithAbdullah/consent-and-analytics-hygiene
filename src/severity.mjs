// The complete severity vocabulary, in increasing order of consequence.
// Nothing else in this repository may invent a severity: every finding
// declares its own set in the catalogue and the suite compares the declared
// sets against the sets a real run produces, in both directions.

export const SEVERITIES = ['notice', 'warning', 'error'];

const RANK = new Map(SEVERITIES.map((name, index) => [name, index]));

export function isSeverity(value) {
  return RANK.has(value);
}

export function rankOf(severity) {
  if (!RANK.has(severity)) throw new Error(`unknown severity: ${severity}`);
  return RANK.get(severity);
}

export function highestOf(severities) {
  let highest = null;
  for (const severity of severities) {
    if (highest === null || rankOf(severity) > rankOf(highest)) highest = severity;
  }
  return highest;
}

// The exit code contract, stated once and read by the CLI, by the README and
// by tools/exit-codes.mjs. The tool derives the code it expects for every
// artefact from the corpus manifests and this table, never from a list of
// its own.
export const EXIT_CODES = {
  clean: 0,
  warning: 1,
  error: 2,
  usage: 64
};

export function exitCodeFor(findings) {
  const highest = highestOf(findings.map((finding) => finding.severity));
  if (highest === 'error') return EXIT_CODES.error;
  if (highest === 'warning') return EXIT_CODES.warning;
  return EXIT_CODES.clean;
}
