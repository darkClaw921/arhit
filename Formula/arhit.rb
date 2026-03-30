class Arhit < Formula
  desc "CLI for code architecture and documentation — for AI agents and humans"
  homepage "https://github.com/igorgerasimov/arhit"
  # Update URL and sha256 when publishing a release
  url "https://github.com/igorgerasimov/arhit/archive/refs/tags/v0.1.0.tar.gz"
  sha256 ""
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", "--production=false"
    system "npm", "run", "bundle"

    libexec.install "bin/arhit-bundle.cjs"

    (bin/"arhit").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@20"].opt_bin}/node" "#{libexec}/arhit-bundle.cjs" "$@"
    EOS
  end

  test do
    system bin/"arhit", "--version"
  end
end
