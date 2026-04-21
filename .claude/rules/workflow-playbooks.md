---
name: workflow-playbooks
description: "Step-by-step playbooks for common deskwork repo workflows"
---

# Workflow Playbooks

## Add a New Plugin

1. Create `plugins/<name>/` directory
2. Add `plugins/<name>/.claude-plugin/plugin.json` with name, version, description
3. Add `plugins/<name>/README.md` with purpose, install, usage
4. Add `plugins/<name>/package.json` if the plugin ships code
5. Register the plugin in root `.claude-plugin/marketplace.json` with a git-subdir entry
6. Validate: `claude plugin validate plugins/<name>`
7. Install locally to smoke-test: `claude --plugin-dir plugins/<name>`

## Add a New Skill to an Existing Plugin

1. Create `plugins/<plugin>/skills/<skill-name>/SKILL.md` with YAML frontmatter:
   ```yaml
   ---
   name: <skill-name>
   description: <one-line description — must be specific enough for the model to pick the right skill>
   ---
   ```
2. Keep one skill per action (UNIX-style composability)
3. If the skill needs multiple required arguments, prompt for them one at a time
4. Bundle helper scripts next to the skill, not as ad-hoc shell
5. Smoke-test: `claude --plugin-dir plugins/<plugin>` then invoke the skill

## Add Helper Scripts

1. Put scripts in `plugins/<plugin>/bin/` — Claude Code adds `bin/` to PATH when the plugin is loaded
2. Use TypeScript with `tsx` as the runner (not `ts-node`, not `npx tsx`)
3. Keep each script focused on a single operation
4. Scripts should exit non-zero on error and print actionable messages

## Run the Marketplace Locally

1. From this repo root: `claude --plugin-dir plugins/<name>` loads a single plugin
2. To exercise the marketplace manifest: `claude plugin install --marketplace $(pwd)`
