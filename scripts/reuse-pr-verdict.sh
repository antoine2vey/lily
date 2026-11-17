#!/usr/bin/env bash
# Decides whether a push to main can reuse the verdict of the pull_request CI
# run that passed on the same tree.
#
# Usage: reuse-pr-verdict.sh <repo> <sha> <before>. Needs GH_TOKEN for gh.
# Stdout holds the html URL of that run, or nothing when the push must run the
# full suite. Stderr holds one reason line either way. Always exits 0.
# Fails closed: an API error or any unmet condition prints no URL.
#
# The PR run tested refs/pull/N/merge, the PR head H merged into main as it was
# then. main only moves forward, so that main is an ancestor of <before>. When
# <before> is an ancestor of H, so is that main, and the merge ref carried H's
# tree. The push carries that tree too when its one commit has H's tree on top
# of <before>. A PR retargeted to main may hold a run that merged H into
# another base, so a retarget refuses reuse.
set -euo pipefail

repo=${1:-}
sha=${2:-}
before=${3:-}

no_reuse() {
	echo "no reuse: $1" >&2
	exit 0
}

api() {
	gh api "$@" 2>/dev/null
}

[[ $before =~ ^[0-9a-f]{40}$ && ! $before =~ ^0+$ ]] \
	|| no_reuse "before '${before}' is not a commit"

commit=$(api "repos/$repo/git/commits/$sha" \
	--jq '"\(.parents | length) \(.parents[0].sha // "-") \(.tree.sha)"') \
	|| no_reuse "cannot read commit $sha in $repo"
read -r parent_count parent tree <<<"$commit"
[ "$parent_count" = 1 ] && [ "$parent" = "$before" ] \
	|| no_reuse "$sha has $parent_count parent(s), first $parent, so it is not one commit on top of $before"

pr=$(api "repos/$repo/commits/$sha/pulls" \
	--jq '[.[] | select(.merged_at != null and .base.ref == "main")]
		| if length == 1 then .[0] | "\(.number) \(.head.sha) \(.head.label) \(.head.repo.full_name // "-")" else empty end') \
	|| no_reuse "cannot list the pull requests of $sha"
[ -n "$pr" ] || no_reuse "$sha is not the merge of exactly one pull request into main"
read -r number head label head_repo <<<"$pr"
branch=${label#*:}

retargets=$(api --paginate "repos/$repo/issues/$number/events?per_page=100" \
	--jq '.[] | select(.event == "base_ref_changed") | .event') \
	|| no_reuse "cannot list the events of PR #$number"
[ -z "$retargets" ] || no_reuse "PR #$number changed its base branch, so its run may have tested another base"

status=$(api "repos/$repo/compare/$before...$head" --jq .status) \
	|| no_reuse "cannot compare $before with PR #$number head $head"
[ "$status" = ahead ] \
	|| no_reuse "PR #$number head $head is '$status' of $before, so its run may have tested another tree"

head_tree=$(api "repos/$repo/git/commits/$head" --jq .tree.sha) \
	|| no_reuse "cannot read PR #$number head $head"
[ "$head_tree" = "$tree" ] \
	|| no_reuse "tree of $sha differs from PR #$number head $head"

# A run's pull_requests list empties once its head branch is deleted, which
# happens on merge. The run is matched by head branch instead, and it targeted
# main when every pull request ever opened from that branch did.
bases=$(api -X GET "repos/$repo/pulls" -f head="$label" -f state=all -F per_page=100 \
	--jq '[.[].base.ref] | unique | join(",")') \
	|| no_reuse "cannot list the pull requests from $label"
[ "$bases" = main ] || no_reuse "pull requests from $label target '$bases', not only main"

runs=$(api "repos/$repo/actions/workflows/ci.yml/runs?head_sha=$head&event=pull_request&status=success" \
	--jq '.workflow_runs | sort_by(.created_at) | reverse | .[]
		| [.head_branch, .head_repository.full_name, .html_url] | @tsv') \
	|| no_reuse "cannot list the CI runs of $head"
run=""
while IFS=$'\t' read -r run_branch run_repo url; do
	if [ "$run_branch" = "$branch" ] && [ "$run_repo" = "$head_repo" ]; then
		run=$url
		break
	fi
done <<<"$runs"
[ -n "$run" ] || no_reuse "no passing pull_request CI run of PR #$number on $head"

echo "$run"
echo "reuse: $sha has the tree that PR #$number passed in $run" >&2
