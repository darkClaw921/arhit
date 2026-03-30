.PHONY: build bundle install-local release

build:
	npm run build

bundle:
	npm run bundle

# Install locally for testing (symlinks bin/arhit.mjs to /usr/local/bin/arhit)
install-local: bundle
	chmod +x bin/arhit.mjs
	ln -sf $(PWD)/bin/arhit.mjs /usr/local/bin/arhit

release: bundle
	@echo "To create a release:"
	@echo "  1. git tag v$(shell node -p 'require(\"./package.json\").version')"
	@echo "  2. git push origin --tags"
	@echo "  3. Create GitHub release from the tag"
	@echo "  4. Update Formula/arhit.rb with the release URL and sha256"
