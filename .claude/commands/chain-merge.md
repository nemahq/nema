# Chain Merge

Sequentially merge chained pull requests using cherry-pick to avoid rebase conflicts.

## Input

`$ARGUMENTS` — space-separated PR numbers in merge order (e.g., `1 2 3`).

## Step 1 — Gather PR metadata

For each PR number, run:

```
gh pr view <number> --json number,headRefName,baseRefName,headRefOid,state,mergeable
```

Collect and store for every PR:

- `headRefName` — branch name
- `baseRefName` — target branch
- `headRefOid` — HEAD commit SHA (record this NOW; it becomes the commit-range anchor later)

Validate:

- Every PR must be in `OPEN` state. If any is not, stop and report.
- The first PR's `baseRefName` is the **root base** (e.g., `staging`, `main`). All subsequent PRs will ultimately merge into this branch.

## Step 2 — Merge the first PR

```
gh pr merge <first-PR-number> --squash
```

Do **not** pass `--delete-branch`. The branch ref may already be gone (repo auto-delete), but the SHA recorded in Step 1 is sufficient.

## Step 3 — Process each remaining PR

For PR at index **i** (starting from 1):

1. **Fetch latest remote state**

   ```
   git fetch origin
   ```

2. **Identify unique commits**

   Using the SHAs recorded in Step 1:

   ```
   git log --reverse --pretty=format:"%H" <SHA of PR i-1>..<SHA of PR i>
   ```

   This yields only the commits added by PR i, excluding everything from the previous branch.

3. **Create a clean branch from the updated root base**

   ```
   git checkout -B temp-chain-merge origin/<root-base>
   ```

4. **Cherry-pick unique commits**

   ```
   git cherry-pick <commit1> <commit2> ...
   ```

   If a cherry-pick conflict occurs → **STOP immediately**.

   **Cleanup on conflict:**

   ```
   git cherry-pick --abort
   git checkout <original-branch>
   git branch -D temp-chain-merge
   ```

   Then report which PR and which commit caused the conflict, and exit. Do NOT attempt automatic conflict resolution.

5. **Verify no new commits were pushed**

   Before force-pushing, confirm the remote branch hasn't changed since Step 1:

   ```
   CURRENT_SHA=$(git ls-remote origin <headRefName of PR i> | cut -f1)
   ```

   If `CURRENT_SHA` ≠ the `headRefOid` recorded in Step 1, **abort immediately** — someone pushed new commits. Report the mismatch and exit.

6. **Force-push to the PR's branch**

   ```
   git push -f origin temp-chain-merge:<headRefName of PR i>
   ```

7. **Update the PR base branch** to point at the root base (it may still reference the previous feature branch):

   ```
   gh pr edit <PR-number> --base <root-base>
   ```

8. **Squash merge**

   ```
   gh pr merge <PR-number> --squash
   ```

9. **Clean up local temp branch**

   ```
   git branch -D temp-chain-merge
   ```

Repeat for the next PR in the list.

## Step 4 — Return to original branch

```
git checkout <branch you were on before starting>
```

## Step 5 — Report

Output a summary table:

```markdown
### Chain Merge Complete

| PR  | Branch | Status |
| --- | ------ | ------ |
| #1  | a      | Merged |
| #2  | b      | Merged |
| #3  | c      | Merged |
```

If stopped due to a conflict, mark completed PRs as `Merged` and the failed one as `Conflict`.

## Constraints

- **Validate PR state before force-push.** If the remote HEAD SHA differs from the one recorded in Step 1, abort to prevent data loss.
- **No automatic conflict resolution.** If cherry-pick fails, clean up and report.
- **Always squash merge.** No merge commits or rebase merges.
- **Record all SHAs before any merge.** Branch refs may be deleted by GitHub auto-delete after merge; SHAs are the only reliable anchors.
- **Never force-push to the root base branch** (e.g., `staging`, `main`).
