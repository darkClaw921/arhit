.PHONY: build bundle install-local release

build:
	npm run build

bundle:
	npm run bundle

# Install locally for testing (symlinks bin/arhit.mjs to /usr/local/bin/arhit)
install-local: bundle
	chmod +x bin/arhit.mjs
	ln -sf $(PWD)/bin/arhit.mjs /usr/local/bin/arhit

# Usage: make release VERSION=0.2.0
release:
ifndef VERSION
	$(error VERSION is required. Usage: make release VERSION=0.2.0)
endif
	./release.sh $(VERSION)
