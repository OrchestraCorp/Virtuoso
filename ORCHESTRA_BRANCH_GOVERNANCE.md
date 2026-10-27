# Virtuoso branch and release governance

## Branches and human review

`main` is the protected product integration branch. Use short-lived `feat/*`, `fix/*`, `docs/*`, and `chore/*` branches. Keep `upstream/master` as a fetch-only source; synchronize through a reviewed `sync/upstream-*` pull request. The existing `codex/maas-connections` development line needs a separate product and integration review before it can enter `main`; do not reset it or combine it with this governance change.

Every `main` change requires a pull request and at least one non-author human maintainer approval. The maintainer set is `egoleecode`, `yry0008`, `icelee-asr`, and `even-ship-it`. The first account retains administrator permission; the other three have Write permission. New pushes dismiss stale approvals, the most recent reviewable push needs approval from someone other than its pusher, and conversations must be resolved. Protection applies to administrators; force pushes, main deletion and auto-merge are disabled.

CODEOWNERS enforcement uses the file on the PR's base branch. It becomes effective after this initial governance PR is reviewed and merged; ordinary independent approval is already required. Coding agents may prepare branches, commits and PRs but may not approve, merge or release without an explicit human decision, including when they use a maintainer's account.

Squash merge is the default for feature and documentation PRs. Merge commits remain enabled for upstream synchronization that needs to preserve ancestry, so linear history is not required across this repository. Rebase merging is disabled. Merged working branches are deleted automatically; retained release branches need explicit maintenance arrangements.

## CI before the first stable release

Repository Actions remain disabled while the inherited workflows are adapted. The upstream CI selects enterprise runner labels that are not provisioned for OrchestraCorp; publication and weighted-approval workflows also reference upstream infrastructure and policies. Do not enable all inherited workflows or treat upstream weighted approval as our human review requirement. A locally passing check is not evidence of a successful GitHub PR check.

The repository currently has no required status checks or CI-backed up-to-date-branch requirement. Before the first stable release:

1. Review which workflows can run in this product repository, isolate upstream publication and approval automation, and use available runners with appropriate permissions and credentials.
2. Run the intended CI on a real product PR and verify that required checks report on every relevant PR, including docs-only and external-contributor changes. Path-filtered checks must not strand required statuses.
3. Require the verified aggregate or individual check names, bind their expected GitHub App, and require the branch to be up to date. The inherited `all checks passed` is only a candidate until validated here.
4. Verify both allowed merges and rejected unreviewed or failing changes. Record actual GitHub rules separately from this source document.

The existing repository-reference check failures for the upstream source pin and a Python lockfile wheel-size value must be resolved before they become required. They must not be hidden by renaming the gate or allowing it to fail silently.

## Stable releases and fixes

Each product reaches its first stable release independently, through an explicit maintainer decision and a non-prerelease GitHub Release with a semantic-version tag, normally `v1.0.0`. Alpha, beta and release-candidate tags, inherited engine versions, package versions, product design manifests and a MaaS connection feature do not establish stable product readiness. Publishing a Release does not automatically activate strict protection.

Before that release, verify the actual branch rules, effective CODEOWNERS, successful current PR checks, human release approval, release credentials and target artifact names. Release from an already reviewed commit on a protected branch. Record its dependency lock, product profile, artifact hashes and real model-service acceptance scope, including effect quality, errors, latency, cancellation and sustained reliability. The installed code and tested artifact must match the published version.

Active tag rules prohibit updates and deletions of `v*` and `orchestra-upstream/*` tags, including by administrators. Creating a tag is a separate release action, not proof of approval. Never reuse the inherited `dsh` publishing targets as an OrchestraCorp release without reviewing ownership and configuration.

Create `release/x.y` only when an older stable version needs independent fixes; apply equivalent branch protection before accepting work. Hotfixes still require PRs and independent review, and return to `main` through an explicit backport or merge PR. Any emergency protection change needs an explicit human administrator decision, a recorded reason, restored rules and independent follow-up review. Automation must not disable protection to make its own push succeed.
