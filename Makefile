.PHONY: publish publish-core publish-cli publish-studio publish-ci publish-ci-core publish-ci-cli publish-ci-studio

# Publish all three @deskwork/* packages to npm at the version currently in
# each packages/<pkg>/package.json. Sources the npm token from
# ~/.config/deskwork/npm-credentials.txt via an ephemeral .npmrc; OTP prompt
# may still appear at publish time depending on the token's 2FA policy.
NPM_TOKEN_FILE := $(HOME)/.config/deskwork/npm-credentials.txt

# Each target writes a temp .npmrc with the token, points npm at it via
# NPM_CONFIG_USERCONFIG, runs publish, then removes the temp file (in a
# trap so it's removed even on failure / OTP cancel).
#
# --no-provenance is required for the manual fallback path: package.json's
# publishConfig.provenance: true is honored by `npm publish` and requires
# an OIDC environment (npm refuses provenance attestation from a token-
# auth publish). The CI path (publish-ci targets below) runs under OIDC
# and emits provenance automatically; the manual emergency-fallback path
# publishes without provenance and the operator accepts the gap.
define PUBLISH_PKG
	@TMP_NPMRC=$$(mktemp -t deskwork-npmrc.XXXXXX); \
	trap "rm -f $$TMP_NPMRC" EXIT; \
	printf '//registry.npmjs.org/:_authToken=%s\n' "$$(cat $(NPM_TOKEN_FILE))" > $$TMP_NPMRC; \
	NPM_CONFIG_USERCONFIG=$$TMP_NPMRC npm publish --access public --no-provenance --workspace @deskwork/$(1)
endef

publish: publish-core publish-cli publish-studio

publish-core:
	$(call PUBLISH_PKG,core)

publish-cli:
	$(call PUBLISH_PKG,cli)

publish-studio:
	$(call PUBLISH_PKG,studio)

# CI path: npm Trusted Publisher (OIDC). No token file, no ephemeral
# .npmrc — `npm publish` picks up the OIDC token from the GitHub Actions
# environment when the workflow has `id-token: write` permission AND the
# package on npmjs.com has a Trusted Publisher entry pointing at the
# workflow file. The `publish-ci` target is what
# .github/workflows/publish-npm.yml invokes; the bare `publish` target
# stays as the operator's manual fallback (token + 2FA OTP per package).
publish-ci: publish-ci-core publish-ci-cli publish-ci-studio

publish-ci-core:
	npm publish --workspace @deskwork/core

publish-ci-cli:
	npm publish --workspace @deskwork/cli

publish-ci-studio:
	npm publish --workspace @deskwork/studio
