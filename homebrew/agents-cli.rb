class AgentsCli < Formula
  desc "AI agents CLI tool"
  homepage "https://github.com/moqa-studio/agents-cli"
  license "MIT"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/moqa-studio/agents-cli/releases/download/v#{version}/ags-darwin-arm64"
      sha256 "PLACEHOLDER"

      def install
        bin.install "ags-darwin-arm64" => "ags"
      end
    else
      url "https://github.com/moqa-studio/agents-cli/releases/download/v#{version}/ags-darwin-x64"
      sha256 "PLACEHOLDER"

      def install
        bin.install "ags-darwin-x64" => "ags"
      end
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/moqa-studio/agents-cli/releases/download/v#{version}/ags-linux-x64"
      sha256 "PLACEHOLDER"

      def install
        bin.install "ags-linux-x64" => "ags"
      end
    end
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ags --version")
  end
end
