.PHONY: publish publish-core publish-cli publish-studio

# Publish all three @deskwork/* packages to npm at the version currently in
# each packages/<pkg>/package.json. Sources the npm token from
# ~/.config/deskwork/npm-credentials.txt via an ephemeral .npmrc; OTP prompt
# may still appear at publish time depending on the token's 2FA policy.
NPM_TOKEN_FILE := $(HOME)/.config/deskwork/npm-credentials.txt

# Each target writes a temp .npmrc with the token, points npm at it via
# NPM_CONFIG_USERCONFIG, runs publish, then removes the temp file (in a
# trap so it's removed even on failure / OTP cancel).
define PUBLISH_PKG
	@TMP_NPMRC=$$(mktemp -t deskwork-npmrc.XXXXXX); \
	trap "rm -f $$TMP_NPMRC" EXIT; \
	printf '//registry.npmjs.org/:_authToken=%s\n' "$$(cat $(NPM_TOKEN_FILE))" > $$TMP_NPMRC; \
	NPM_CONFIG_USERCONFIG=$$TMP_NPMRC npm publish --access public --workspace @deskwork/$(1)
endef

publish: publish-core publish-cli publish-studio

publish-core:
	$(call PUBLISH_PKG,core)

publish-cli:
	$(call PUBLISH_PKG,cli)

publish-studio:
	$(call PUBLISH_PKG,studio)
