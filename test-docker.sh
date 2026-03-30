#!/bin/bash
set -euo pipefail

echo "==> Building test image..."
docker build -f Dockerfile.test -t arhit-test .

echo "==> Running e2e tests in Docker..."
docker run --rm arhit-test

echo "==> Done."
