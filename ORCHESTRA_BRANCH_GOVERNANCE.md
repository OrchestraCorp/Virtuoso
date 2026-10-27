# Virtuoso branch and release governance

`main` is the protected product integration branch. Use short-lived `feat/*`, `fix/*`, `docs/*`, and `chore/*` branches. Keep `upstream/master` as a fetch-only source; synchronize it through an explicitly reviewed `sync/upstream-*` pull request. The `codex/maas-connections` branch is an active development line and must not be merged into `main` without a separate product and integration review.

Every `main` change goes through a pull request. At least one of `yry0008`, `icelee-asr`, or `even-ship-it` must approve without authoring the change. New pushes dismiss stale approvals; the latest commit must be reviewed, conversations must be resolved, and force pushes or deletion of `main` are forbidden. Squash merge is the default.

The inherited workflows and approval-policy files contain upstream assumptions and are not automatically required checks for OrchestraCorp. Before the first stable release, run the intended pull-request CI on a real OrchestraCorp pull request, remove or isolate upstream-only publication paths as needed, and then require only the exact checks that have actually succeeded. AI or weighted upstream approval is supplementary and does not replace a human maintainer approval.

The first stable release is an explicit maintainer decision represented by a GitHub Release and an immutable `v1.0.0`-style tag. The developer-preview branch, product design manifest, or a MaaS connection feature does not constitute a stable release. Stable release preparation must record the source commit, dependency lock, product profile, build artifacts and model-service acceptance scope.

Release and hotfix branches use the same pull-request rules. A maintained release line is created only when a stable version needs independent fixes; fixes are merged back to `main`. Administrators do not routinely bypass protection. An emergency bypass requires a recorded reason and a follow-up maintainer review.
