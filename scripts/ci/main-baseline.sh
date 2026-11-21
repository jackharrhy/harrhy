#!/usr/bin/env bash
set -eu
if sha=$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1" --jq '.workflow_runs[0].head_sha // empty') &&
  [[ $sha =~ ^[0-9a-f]{40}$ && $sha != "$GITHUB_SHA" ]] &&
  git merge-base --is-ancestor "$sha" "$GITHUB_SHA"; then
  echo "sha=$sha" >> "$GITHUB_OUTPUT"
  echo "Main CI baseline: $sha"
else
  echo 'No usable successful main CI baseline; selecting all workspace checks.'
fi
