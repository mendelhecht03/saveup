# SaveUp

The shared home for SaveUp's code. Open this same repository folder in Codex, Claude Code, or VS Code to work on the same files. GitHub stores the committed history; your local folder is where edits happen.

The current app is a **temporary, mock-data Focused Inbox prototype**, with the icy-blue Friendly Spatial design. It is not connected to a bank.

## Run it locally

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

See [the switching and sync guide](docs/working-with-agents.md) for the exact Git steps and the difference between switching locally and pulling changes from another computer.

## Where things live

| Path | Purpose |
| --- | --- |
| `prototype/dist/` | The editable app: HTML, CSS, JavaScript, icons, and local fonts |
| `prototype/dist/app.js` | Screens and interactions |
| `prototype/dist/model.js` | Transaction and budget calculations, using integer cents |
| `prototype/tests/` | Automated ledger tests |
| `docs/product-spec.md` | Original Personal Budgeting Web-App specification, wording preserved |
| `docs/project-status.md` | Current decisions, implemented scope, and limitations |
| `AGENTS.md` | Shared project instructions for both assistants |
| `CLAUDE.md` | Imports the shared instructions for Claude Code |
| `index.html`, `privacy.html` | Existing public landing and privacy pages |

Although named `dist`, the prototype folder contains hand-edited source files. There is no build step or framework to install.

## Phone preview and publishing

The existing [private phone preview](https://saveup-inbox-lab-mendel.mendelhecht770.chatgpt.site/) stays available in iPhone Safari. Sign in with the owning ChatGPT account if prompted. Localhost works on the computer running the server, not on your phone.

**Pushing to GitHub does not update that preview.** The preview is a separate Sites deployment; see [deployment notes](docs/deployment.md). The repository's GitHub Pages site serves the public landing/privacy pages. `_config.yml` excludes the prototype and project documents from that public site.
