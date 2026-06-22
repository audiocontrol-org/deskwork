# Release Process: stack-control opencode plugin

## Versioning Strategy

- Follow semantic versioning (MAJOR.MINOR.PATCH)
- Version must match `stackctl` CLI version when possible
- Plugin version tracked in `opencode/package.json`

## Release Checklist

1. Update version in `opencode/package.json`
2. Update changelog (if applicable)
3. Run tests: `npm test`
4. Build: `npm run build`
5. Verify installation: `tsx ../bin/verify-install.ts`
6. Commit changes: `git commit -am "Release v<version>"`
7. Tag release: `git tag v<version>`
8. Push: `git push && git push --tags`

## Pre-release

- Test with local opencode installation
- Verify all skills work
- Check error handling for missing CLI
