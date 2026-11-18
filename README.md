# consent-and-analytics-hygiene

Cookie banners, consent mode and analytics tag hygiene, as patterns you can
run rather than opinions you have to take on trust.

A cookie banner is usually the worst keyboard trap on a site, the consent
defaults are usually declared after the thing they are meant to govern, and
the tag container nobody reads is where both of those are actually decided.
This repository holds a dependency free checker for all three, a failing
example beside every corrected one, and a written down account of what it
cannot see.

```
npx consent-check path/to/page.html path/to/app.js path/to/capture.http
```

## What this is

A catalogue, a checker and a corpus.

**The catalogue** is 64 catalogued findings across 7 areas: the banner as an
interactive component, consent mode defaults and updates, tag containers and
script elements, Set-Cookie attributes and timing, analytics payload hygiene,
client storage and pre-consent network activity, and consent platform
configuration. One entry per reason a reviewer would give, never one per
check: two checks that exist because of the same underlying mistake share one
entry, and a single check that fires for two different reasons is split in
two. Each entry declares the complete set of severities it can carry, and the
suite compares that set against a real run in both directions, so a severity
a run produces that is not declared fails the build, and a severity declared
that no artefact has ever produced fails it too.

**The checker** reads five kinds of input: pages, scripts, captured response
headers, tag container exports and consent platform configurations. Two of
the five are configuration rather than code, because several findings are
decisions somebody made in a settings screen and are invisible in both the
page and the network capture. It has no dependencies, including no HTML
parser: it ships a small element scanner and a script call scanner and states
what they cannot do. That was cheaper than a dependency and more useful,
because writing the limits down is what produced most of the defects found
while building it.

**The corpus** is 21 pattern pairs and 19 fixtures. Every artefact declares
the exact set of findings it produces, as `id@severity` tokens, compared in
both directions. Exact, in both directions, is the point: an inclusion
assertion hides every false positive the corpus triggers by construction,
because a corrected artefact that still reports something passes. Four of the
defects found while building this were found by exactly that, a corrected
artefact reporting something it should not have. One pair declares a
**residual**: a finding its corrected side still produces, because the choice
behind it is deliberate and the suite requires it to still be there.

## What it cannot see

11 declared limits, in docs/limits.md, which is generated from the manifest
so the prose cannot drift from the behaviour. Each one carries two artefacts
and the suite asserts the exact set of findings both of them produce.

They come in two kinds, and keeping them apart matters. Eight **hide** a real
problem: the blind artefact holds the problem and reports nothing at all,
while the contrast artefact holds the same problem in a form the scanner can
see. Three **manufacture** a finding that is not a real problem: the blind
artefact reports it, which is wrong but honest, and the contrast artefact is
clean. Without that distinction an honest refusal reads as a limit that has
been fixed, and a false positive reads as a real finding.

The clearest of them is `source-order-not-execution-order`. Whether something
happens before the decision is judged by where it sits relative to the consent
gate in the source, so a function declared above the gate and called from the
consent handler is reported although it runs afterwards. Moving the
declaration below the gate clears the report without changing a line of
behaviour.

## Verifying

```
npm test                        # 815 tests
node tools/verify.mjs           # every repository claim
node tools/exit-codes.mjs       # the real binary over every artefact
node tools/audit-verdicts.mjs   # the checkers over every artefact, both output modes
node tools/entry-thin.mjs       # the entry point is still wiring
node tools/gen-docs.mjs --check # the generated documents match their generator
```

`tools/exit-codes.mjs` runs the installed binary over all 83 artefacts, by
path and through a symlink, in both output modes, and **derives** the exit
code it expects from the corpus manifests and the severity table rather than
from a list of its own. It runs through a symlink because resolving a path
without following symlinks is the most repeated defect across these
repositories: one of them declared a binary which, through the symlink npm
installs it as, printed nothing and exited zero for the whole life of the
package while fifty tests passed.

`tools/verify.mjs` is 54 repository assertions, which is the length of a
fixed list of named claims, including the claim about the length. It is not a
count of assertions made per file: an assertion made once inside a loop over
forty files used to be reported as forty, which grew when a file was added
and told a reader nothing. Because of that, **the figure is not comparable
with the assertion totals quoted by my other repositories**. Judge depth by
the test count and the size of the catalogue.

Each claim takes a context, which is what lets a verifier that runs the suite
be called from inside the suite: the command line fills the test count by
spawning the counter, and the suite fills it from this file. The suite also
perturbs a copy of the repository thirteen ways and requires the matching claim
to fail each time, so no claim is passing because its loop body never runs.

CI runs the suite on Node 20.18.1, 22.23.5 and 24.11.1, exactly those
versions and not a bare major, because `actions/setup-node` resolves a bare
major to the newest release of that line. Two further jobs check that the
declared floor installs on the floor and that a floor above the runtime is
refused, which is the only way to test that the floor is a promise rather
than a comment.

## The findings

docs/findings.md lists all of them with the reason and the fix, and
docs/inputs.md documents the five input formats, the closed vocabularies and
the word lists. Both are worth reading before trusting a clean run: the
tracker host list is closed on purpose, and a tracker that is not on it is
not recognised.

## Licence

MIT, no attribution required. The patterns here are generalised from work on
real sites and contain no client code, client names or client domains, and the
suite asserts it: every host in every artefact is an example domain, a
reserved test name, a documented tracker host or public infrastructure.
