// Every decision the command line makes lives here, and takes its streams,
// its filesystem and its clock as arguments. bin/consent-check.mjs is
// wiring only, and tools/entry-thin.mjs fails the build if a decision moves
// back into it.

import { buildInputs, InputError, KINDS } from './inputs.mjs';
import { audit } from './audit.mjs';
import { jsonReport, textReport } from './report.mjs';
import { EXIT_CODES, exitCodeFor } from './severity.mjs';

export const USAGE = [
  'consent-check [options] <file...>',
  '',
  'Reads consent banners, scripts, captured response headers, tag container',
  'exports and consent platform configurations, and reports what is wrong.',
  '',
  'Options:',
  '  --json          machine readable output',
  '  --as <kind>     read every following file as this kind',
  `                  (${KINDS.join(', ')})`,
  '  --help          this text',
  '',
  'Exit codes:',
  `  ${EXIT_CODES.clean}  nothing above a notice`,
  `  ${EXIT_CODES.warning}  at least one warning`,
  `  ${EXIT_CODES.error}  at least one error`,
  `  ${EXIT_CODES.usage}  the arguments or the inputs could not be read`
].join('\n');

export function parseArgv(argv) {
  const files = [];
  let json = false;
  let help = false;
  let kind = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') json = true;
    else if (argument === '--help' || argument === '-h') help = true;
    else if (argument === '--as') {
      index += 1;
      kind = argv[index];
      if (!KINDS.includes(kind)) {
        throw new InputError(`--as needs one of ${KINDS.join(', ')}, not ${String(kind)}`);
      }
    } else if (argument.startsWith('-')) {
      throw new InputError(`unknown option ${argument}`);
    } else {
      files.push({ path: argument, kind });
    }
  }
  return { files, json, help };
}

export function runCli({ argv, stdout, stderr, readFile }) {
  let parsed;
  try {
    parsed = parseArgv(argv);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return EXIT_CODES.usage;
  }

  if (parsed.help) {
    stdout.write(`${USAGE}\n`);
    return EXIT_CODES.clean;
  }

  if (parsed.files.length === 0) {
    stderr.write(`${USAGE}\n`);
    return EXIT_CODES.usage;
  }

  let inputs;
  try {
    const loaded = parsed.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      source: readFile(file.path)
    }));
    inputs = buildInputs(loaded);
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return EXIT_CODES.usage;
  }

  const findings = audit(inputs);
  stdout.write(parsed.json ? jsonReport(findings) : textReport(findings));
  return exitCodeFor(findings);
}
