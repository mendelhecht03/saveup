# SaveUp

The shared home for SaveUp's code. Open this same repository folder in Codex, Claude Code, or VS Code to work on the same files. GitHub stores the committed history; your local folder is where edits happen.

SaveUp now has a **local MVP foundation** with saved transaction reviews and a Plaid Sandbox connection path, alongside the earlier temporary mock-data prototype. Both preserve the icy-blue Friendly Spatial direction. Production banks are not enabled.

The current MVP is scoped to **Plaid integration, a basic inbox, and weekly category budgets**. The remaining Figma screens and advanced features can wait.

## Continue with Claude

**Active code: `mvp/` · Branch: `feature/plaid-sandbox` · Folder: `C:\dev\projects\saveup`.** Read the [Claude handoff](docs/claude-handoff.md) for the current task, file map, test credentials, iPhone preview, and verification limits.

Visual target: [SaveUp / pocket Figma designs](https://www.figma.com/design/NeCYcLrTSJtmH4k4ZhifxT/Untitled?node-id=0-1). The next priority is to bring the existing inbox/review/budgeting UI closer to Figma; Mendel prefers its appearance. The old `prototype/` is a separate mock-data reference.

## Start the MVP

```sh
npm run mvp
```

Open **http://127.0.0.1:4188** and load the sample bank to try it immediately. See [MVP setup](docs/mvp-setup.md) for Sandbox credentials, the walkthrough, storage, and current limitations. A push to GitHub does not deploy this local backend.

## Run the earlier prototype

Install Node.js 24 LTS, then open a terminal in this folder:

```sh
npm start
```

Open **http://127.0.0.1:4187**. No package installation or credentials are needed. Keep the terminal running; press Ctrl+C to stop. After editing, refresh the browser to see the change.

To check the JavaScript and run the ledger tests:

```sh
npm run check
```

## Use either coding assistant

1. Open **this folder**, the one containing `AGENTS.md` and `package.json`, in Codex or VS Code.
2. In VS Code, open the Claude Code panel; sign in if prompted. You can also run `claude` in this folder's terminal.
3. Let one assistant finish before asking the other to edit. Both see the same saved files. Their chat histories are separate, so project context lives in the files below.
4. Ask the assistant to check the changes, commit, and push when you want to save a checkpoint on GitHub. Git does not automatically upload every file save.

Start with: “Read AGENTS.md and docs/project-status.md. Check the current Git changes, then help me with …”

`AGENTS.md` holds the common instructions. `CLAUDE.md` contains only `@AGENTS.md`, so you edit the guidance in one place. For details about the tools, see [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Claude's shared instruction imports](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools), and [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code).

### Saving and syncing

| Action | What it does |
| --- | --- |
| Save | Updates the files on this computer; either assistant can see them |
| Commit | Creates a named checkpoint in local Git history |
| Push | Uploads committed checkpoints to GitHub |
| Pull | Downloads and integrates commits from GitHub |

Switching assistants in the same folder does not require a pull. Before handing off, save the files and ask the current assistant to summarize unfinished work, the active branch, and whether changes were committed and pushed.

For a new task, start from an up-to-date `main` with a clean working folder, then create a descriptive branch. A branch keeps the task's changes together. When handing the same task to another assistant, stay on that branch. After checking the changes, ask the assistant to commit, push, and open a pull request: a GitHub page for reviewing the changes before merging them into `main`.

After a merge or work on another computer, run these commands **only when you have no unfinished local edits**:

```sh
git status
git switch main
git pull --ff-only
```

If Git reports a conflict or refuses the pull, ask the assistant to preserve both sets of changes and explain the next step. Do not discard edits or force-push to get past it. There is no automatic upload process running in the background.

If you later want both assistants editing simultaneously, use separate Git worktrees or clones with separate branches. Two branches alone do not isolate edits in the same folder.

## Where things live

| Path | Purpose |
| --- | --- |
| `prototype/dist/` | The editable app: HTML, CSS, JavaScript, icons, and local fonts |
| `prototype/dist/app.js` | Screens and interactions |
| `prototype/dist/model.js` | Transaction and budget calculations, using integer cents |
| `prototype/tests/` | Automated ledger tests |
| `mvp/` | Local server, durable SQLite storage, Sandbox adapter, and first working app slice |
| [Product specification](docs/product-spec.md) | Your original vision, wording preserved |
| [Project status](docs/project-status.md) | What works now, limitations, and a prototype walkthrough |
| [Deployment notes](docs/deployment.md) | How the private phone preview and public landing page are published |
| [MVP setup](docs/mvp-setup.md) | Run the local app and enable Plaid Sandbox |
| `AGENTS.md` | Shared project instructions for both assistants |
| `CLAUDE.md` | Imports the shared instructions for Claude Code |
| `index.html`, `privacy.html` | Existing public landing and privacy pages |
| `prototype/dist/assets/FONT-LICENSE.txt` | License supplied with the bundled fonts; keep it with them |

Although named `dist`, the prototype folder contains hand-edited source files. There is no build step or framework to install.

## Phone preview and publishing

The existing [private phone preview](https://saveup-inbox-lab-mendel.mendelhecht770.chatgpt.site/) stays available in iPhone Safari. Sign in with the owning ChatGPT account if prompted. Localhost works on the computer running the server, not on your phone.

**Pushing to GitHub does not update that preview.** The preview is a separate Sites deployment; see [deployment notes](docs/deployment.md). The repository's GitHub Pages site serves the public landing/privacy pages. `_config.yml` excludes the prototype and project documents from that public site.
