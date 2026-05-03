---
name: workflow-playbooks
description: "Step-by-step playbooks for common deskwork repo workflows"
---

# Workflow Playbooks

## Add a New Plugin

1. Create `plugins/<name>/`
2. Add `plugins/<name>/.claude-plugin/plugin.json`
3. Add `plugins/<name>/README.md`
4. Add `plugins/<name>/package.json` if needed
5. Register it in `.claude-plugin/marketplace.json`
6. Validate the plugin
7. Smoke-test the plugin load path

## Add a New Skill to an Existing Plugin

1. Create `plugins/<plugin>/skills/<skill-name>/SKILL.md`
2. Keep one skill per action
3. Prompt for multiple required args one at a time
4. Put helper scripts next to the skill or in `bin/`
5. Smoke-test it

## Add Helper Scripts

1. Put them in `bin/`
2. Prefer TypeScript with `tsx` where that is the repo norm
3. Keep each script focused
4. Exit non-zero on real errors

## Run the Marketplace Locally

1. `claude --plugin-dir plugins/<name>` for a single plugin
2. Use the documented marketplace path when testing the full adopter install shape
