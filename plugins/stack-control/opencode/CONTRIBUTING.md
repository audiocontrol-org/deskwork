# Contributing Guide: stack-control opencode plugin

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Test: `npm test`

## Project Structure

```
plugins/stack-control/
├── opencode-plugin.ts      # Main plugin file (copied to ~/.opencode/plugins/)
├── opencode/               # Plugin source code
│   ├── index.ts           # Entry point
│   ├── cli.ts             # CLI delegation
│   ├── skills.ts          # Skill definitions
│   ├── plugin.ts          # Plugin state management
│   ├── events.ts          # Event handlers
│   └── version.ts         # Version checking
├── types/                 # TypeScript type definitions
├── tests/                 # Test files
├── docs/                  # Documentation
└── bin/                   # Utility scripts
```

## Development Workflow

1. Create a feature branch
2. Implement changes
3. Add tests
4. Run tests: `npm test`
5. Build: `npm run build`
6. Verify: `tsx bin/verify-install.ts`
7. Copy plugin to opencode: `cp opencode-plugin.ts ~/.opencode/plugins/stack-control.ts`
8. Restart opencode and test

## Pull Request Checklist

- [ ] Tests pass
- [ ] Build succeeds
- [ ] Type checking passes
- [ ] Documentation updated
- [ ] Version incremented in package.json
