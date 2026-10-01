#!/usr/bin/env bash
# Recommended settings for github.com/mikesimone/tab-automator.
# Run on sixofone (needs gh logged in as mikesimone). Safe to re-run.
set -euo pipefail
R=mikesimone/tab-automator

# 1. Repo basics: store link as homepage, tidy features, clean up merged branches.
gh repo edit "$R" \
  --homepage "https://chromewebstore.google.com/detail/mookagdegldeclccpbjgpbdacipiehff" \
  --add-topic chrome-extension --add-topic tab-manager --add-topic auto-refresh \
  --enable-wiki=false --enable-projects=false \
  --delete-branch-on-merge \
  --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false

# 2. Security features (free on public repos).
gh api -X PATCH "repos/$R" --input - <<'JSON'
{"security_and_analysis": {
  "secret_scanning": {"status": "enabled"},
  "secret_scanning_push_protection": {"status": "enabled"}
}}
JSON
gh api -X PUT "repos/$R/vulnerability-alerts"            # Dependabot alerts
gh api -X PUT "repos/$R/automated-security-fixes"        # Dependabot security PRs
gh api -X PUT "repos/$R/private-vulnerability-reporting" # private "Report a vulnerability" button

# 3. Protect main from force-pushes and deletion. Direct pushes (including
#    Claude's) are still allowed, so commits can go straight to main.
gh api -X POST "repos/$R/rulesets" --input - <<'JSON'
{
  "name": "Protect main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {"ref_name": {"include": ["~DEFAULT_BRANCH"], "exclude": []}},
  "bypass_actors": [{"actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always"}],
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"}
  ]
}
JSON

echo "Done. Check: https://github.com/$R/settings/rules"
