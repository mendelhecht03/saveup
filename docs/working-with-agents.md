# Switching between Codex and Claude Code

Use **one local SaveUp repository folder**. Codex, Claude Code in a terminal, and the Claude Code VS Code extension can all edit its files. GitHub keeps a copy of committed work and its history. You do not need to copy code between chats or maintain a Claude version and a Codex version.

## Your normal workflow

1. Open this folder in whichever tool you want to use. In VS Code, use **File → Open Folder** and select the folder containing `AGENTS.md`, `package.json`, and `prototype`.
2. Ask it to read `AGENTS.md` and `docs/project-status.md`, inspect the current Git changes, and continue the task.
3. Run `npm start` to preview; run `npm run check` to verify the code.
4. Before switching assistants, let the current one finish. Save files and preferably make a commit: a named checkpoint in Git history. Ask it to leave a short handoff explaining unfinished work.
5. Open the same folder with the other assistant. It sees the saved changes immediately, even if they have not yet been pushed. It does not inherit the previous chat's conversation.

The root `AGENTS.md` keeps the common rules in one place. `CLAUDE.md` imports it using `@AGENTS.md`, including for older Claude Code versions. Edit shared guidance in `AGENTS.md`.

## What “sync” means

| Action | Result |
| --- | --- |
| Save a file | Updates this computer's working copy |
| Commit | Saves a checkpoint in local Git history |
| Push | Uploads committed checkpoints to GitHub |
| Pull | Downloads and integrates commits from GitHub |

Switching tools in the **same folder** does not require a pull. Pull when another computer, a cloud coding session, or a GitHub merge changed the remote branch. Do not pull over unfinished edits; commit them first or ask the assistant to preserve them before syncing.

GitHub is not automatic file synchronization. Use commit/push at useful checkpoints. There is no auto-push process running in the background.

## A new task, step by step

After completing the previous task, with a clean working folder:

```sh
git status
git switch main
git pull --ff-only
git switch -c feature/my-change
```

Choose a descriptive branch name. A branch keeps a task's commits together while `main` remains the settled version. If you are handing the same task to another assistant, stay on the existing branch.

After making and reviewing changes:

```sh
npm run check
git diff
git add <the-files-you-changed>
git commit -m "Describe the change"
git push -u origin HEAD
```

Replace `<the-files-you-changed>` with real filenames; it is a placeholder, not a command to paste literally. The assistant can do these steps for you. Open a pull request on GitHub, review the changes and automated checks, then merge it when ready. A pull request is a review page for the branch's changes.

After merging, with no unfinished local edits:

```sh
git switch main
git pull --ff-only
```

If Git reports a conflict or refuses a pull, ask the assistant to inspect and preserve both sets of work. Do not use `git reset --hard` or a force push to get past it.

## Opening Claude

In VS Code, open the Claude Code panel from its icon or the Command Palette. Sign in if prompted. Alternatively, open a terminal in this repository and run:

```sh
claude
```

The initial setup found both the Claude Code CLI and the `anthropic.claude-code` VS Code extension already installed. No Claude account credentials were changed. For Codex, open this same repository as the local project; use a new chat there if the existing chat still points at the older parent folder.

## Working at the same time, later

Alternating tools is simplest. If you eventually want both editing simultaneously, give each its own Git worktree or clone and its own branch. Two branches alone do not isolate edits inside a single folder. Ask an assistant to set up the separate folders when you need them.

## Official references

- [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Claude Code shared instruction imports](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools)
- [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
