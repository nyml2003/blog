---
kind: contract
id: CONTENT-REPO-CONTRACT-001
status: draft
---

# Content Repository Contract

Implementation draft for PLAN-CONTENT-GITHUB-TRUTH-001. Local parsing and workspace tests are
implemented; production transport, history recovery and cache import are still pending.

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

`taxonomy.json` contains `article_types` and `terms`. A type has `id`, `name`, `created_at`, and
`updated_at`. A term has those fields plus `kind`, which is either `topic` or `tag`.

An empty repository requires only `taxonomy.json`: Git does not track empty directories, so
`articles/` may be absent until the first article is submitted. Do not add a `.gitkeep` in it.

`meta.json` contains `id`, `title`, `summary`, `article_type_id`, `term_ids`, `created_at`,
`updated_at`, and optional `published_at`. The directory name and `meta.json.id` must match.
`summary` is limited to 160 Unicode scalar values. Every referenced type and term must exist in
the same `taxonomy.json`; term IDs may not repeat within an article.

`content.html` is the raw UTF-8 HTML fragment. It is not frontmatter and is never silently
rewritten. It must pass the shared `article-html/v1` inspector before a snapshot is accepted.

## Identity and publication time

Article IDs are positive stable numbers. An ID is never assigned to a different article after it
has been used. The first publication time is the first merge into `main`, recovered from GitHub
history. Save time, branch creation time, and synchronization time are not substitutes for that
history value.

The presence of an article directory on `main` determines public visibility. A server workspace,
open branch, or open pull request does not make an article public. Removing an article directory
is a staged unpublish; restoring the same ID does not create a new identity.

## Batch and source rules

Every save validates the resulting complete workspace but writes only the server-local temporary
workspace. A batch submission validates the complete target tree again and writes one commit to
one active branch and pull request. The server has no merge operation. Public cache replacement
only happens after a successful manual or startup synchronization from one `main` commit.

Development, mock, and automated tests use an explicit isolated fixture remote. A production
GitHub client is selected by explicit configuration; the presence of a token alone never changes
the source mode.
