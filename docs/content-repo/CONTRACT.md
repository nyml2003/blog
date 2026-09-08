---
kind: contract
id: CONTENT-REPO-CONTRACT-001
status: current
---

# Content Repository Contract

The private content repository is the source of truth for content that has been merged into
`main`. The server never asks authors to edit these files directly. Authors edit in the admin
workspace; the server submits one batch pull request and the author merges it in GitHub.

## Layout

```text
taxonomy.json
articles/
  <positive numeric id>/
    meta.json
    content.html
```

`taxonomy.json` is an `application/json` document with `version = 1`, independent
`next_category_id` and `next_tag_id` watermarks, a category tree, and flat tags. Category entries
contain `id`, `name`, nullable `parent_id`, and `position`; tag entries contain `id` and `name`.
Watermarks identify the next server-allocatable ID and only move forward. Deleted or merged IDs
remain below the watermark and are never allocated again. Categories are ordered by parent,
position, then ID. Sibling names and positions are unique, and the tree must be acyclic.

An empty repository requires only `taxonomy.json`: Git does not track empty directories, so
`articles/` may be absent until the first article is submitted. Do not add a `.gitkeep` in it.

`meta.json` contains `id`, `title`, `summary`, `category_ids`, `tag_ids`, `created_at`,
`updated_at`, and optional `published_at`. The directory name and `meta.json.id` must match.
`summary` is limited to 160 Unicode scalar values. Category and tag arrays are independently
deduplicated. Every category reference must exist and point to a leaf; every tag reference must
exist in the same `taxonomy.json`. Parent categories are navigation and aggregation nodes only.

`content.html` is the raw UTF-8 HTML fragment. It is not frontmatter and is never silently
rewritten. It must pass the shared `article-html/v1` inspector before a snapshot is accepted.
An article on `main` must reference at least one leaf category so the existing public API has a
defined article type.

The reader resolves `main` once and reads every tree and blob from that commit. The repository
contains only the paths above, regular `100644` blobs, and their `articles/` directories. A
truncated tree, unmatched article files, non-canonical numeric directory, unsupported entry type,
or configured file/tree/snapshot/history limit rejects the whole import. Partial imports are not
published.

## Identity and publication time

Article IDs are positive stable numbers. An ID is never assigned to a different article after it
has been used. The first publication time is recovered in one bounded walk of the fixed `main`
commit's first-parent history. Product inspects each commit's paginated changed-file list and
records the oldest commit that introduced or changed each current article's `meta.json`. For a
regular merge this is the merge committer timestamp at which the path first became reachable on
main. For a fast-forward it is the committer timestamp of the earliest reachable path commit; Git
does not retain a separate ref update timestamp. Author time, save time, branch creation time, and
synchronization time are not substitutes for this value. The complete remote operation has both a
request-count budget and a wall-clock deadline; exceeding either rejects the whole import.

The presence of an article directory on `main` determines public visibility. A server workspace,
open branch, or open pull request does not make an article public. Removing an article directory
is a staged unpublish; restoring the same ID does not create a new identity.

Data retains an identity tombstone containing `id`, `created_at`, and first `published_at` after an
article is removed from main. A later snapshot may restore that ID only with the same identity and
publication time. A source commit already stored with byte-equivalent structured content is an
idempotent no-op; the same commit paired with different content is an integrity error.

## Public compatibility projection

The imported snapshot and existing public relations are replaced in one Data transaction. Public
API shapes remain unchanged. Each root category becomes an article type with the same numeric ID.
Every leaf category becomes a `topic` term with ID `category_id * 2`; every tag becomes a `tag`
term with ID `tag_id * 2 + 1`. Checked arithmetic rejects overflow and the even/odd namespaces
cannot collide. All referenced leaves and tags appear as terms. For an article spanning multiple
roots, the root with the smallest `(position, id)` is its primary article type. Recommendation
rows for removed article IDs are deleted while remaining rows retain their order and active set.

## Batch and source rules

Every save validates the resulting complete workspace but writes only the server-local temporary
workspace. A batch submission validates the complete target tree again and writes one commit to
one active branch and pull request. The server has no merge operation. Public cache replacement
only happens after a successful manual or startup synchronization from one `main` commit.

The managed branch name is deterministic for a workspace version and target digest. The server
never force-updates it, never merges it, and fails closed if multiple active managed branches or
pull requests exist. Closed and merged historical branches may remain in GitHub and do not block a
later batch. Submit and discard intent is persisted before the remote call. A retry queries the
branch commit marker and pull request, so a commit written before a timeout or PR creation failure
is recovered instead of duplicated. A batch is cleared only after GitHub confirms PR closure or a
merged main snapshot has been imported; a merged PR cannot be abandoned. Main moving away from the
workspace's synchronized base is a conflict.

When local saved changes and a newer main snapshot coexist, Product performs a three-way rebase
from the saved base. Changes to distinct article IDs are retained from both sides. Concurrent
changes to the same article or to taxonomy fail explicitly without advancing the workspace base;
abandoning the local workspace and synchronizing again adopts the newer main snapshot.

Development, mock, and automated tests use an explicit isolated fixture remote. A production
GitHub client is selected by explicit configuration; the presence of a token alone never changes
the source mode.

Run `ops content repository init` once for a new private repository. The explicit operation uses
`BLOG_CONTENT_REPO` and `BLOG_CONTENT_TOKEN` to create a root `main` commit containing only the
canonical empty `taxonomy.json`. It is idempotent when `main` already contains that exact empty
snapshot and rejects repositories with non-empty or incompatible content. It never creates sample
articles and never writes credentials into the repository.

Selecting the GitHub source and providing usable credentials are separate states. A Product
process configured with `--content-source github` still starts from the Data last-good snapshot
when either credential is missing or invalid, and records the startup synchronization failure.
Remote management operations remain unavailable until the process is restarted with valid
configuration; public reads continue from Data.
