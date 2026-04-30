.PHONY: publish publish-core publish-cli publish-studio

# Publish all three @deskwork/* packages to npm at the version currently in
# each packages/<pkg>/package.json. Sources the npm token from
# ~/.config/deskwork/npm-credentials.txt; OTP prompt may still appear at
# publish time depending on the token type and the package's 2FA policy.
NPM_TOKEN_FILE := $(HOME)/.config/deskwork/npm-credentials.txt
PUBLISH_ENV := NPM_CONFIG_TOKEN=$$(cat $(NPM_TOKEN_FILE))

publish: publish-core publish-cli publish-studio

publish-core:
	$(PUBLISH_ENV) npm publish --access public --workspace @deskwork/core

publish-cli:
	$(PUBLISH_ENV) npm publish --access public --workspace @deskwork/cli

publish-studio:
	$(PUBLISH_ENV) npm publish --access public --workspace @deskwork/studio
