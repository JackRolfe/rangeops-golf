# AGENTS.md

## Agent skills

### Issue tracker

Specs and tickets live as local Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created as terms and decisions are settled. See `docs/agents/domain.md`.

## Working rules

- **Push your branch to GitHub when your work is done and tested.** The repository is public, so never commit secrets: signing keys, tokens and `.env` files stay in gitignored folders. Don't merge into `main` or push to it unless the user asks. GitHub Pages is switched off; CI only tests.
- **Deploys go to Azure.** The demo runs in the resource group `rg-rangeops-aue`, described in [deploy/azure/README.md](deploy/azure/README.md). Ship with `deploy/azure/deploy.sh`. Keep it cheap: ask before adding anything that costs more than a few dollars a month.
- **Work in your own worktree and branch** when other sessions may be running, and stay inside the files your task names.
- **Keep moving.** When a decision is yours to make and reversible, pick a sensible default, write it down (in the spec, the ticket, `CONTEXT.md` or an ADR), and carry on. Stop to ask only for something irreversible, outward-facing, or a real product choice the plan doesn't settle.
- **The plan is [docs/PLAN.md](docs/PLAN.md).** The robot's plan, design and control link are in [robot/](robot/README.md).
