#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Keyboard Maker — Toolchain Setup
# Installs all prerequisites for the keyboard-maker project.
# Idempotent: skips anything already installed.
# ──────────────────────────────────────────────────────────────

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${CYAN}[info]${RESET}  %s\n" "$*"; }
ok()    { printf "${GREEN}[ok]${RESET}    %s\n" "$*"; }
warn()  { printf "${YELLOW}[warn]${RESET}  %s\n" "$*"; }
err()   { printf "${RED}[err]${RESET}   %s\n" "$*"; }
step()  { printf "\n${BOLD}── %s${RESET}\n" "$*"; }

# ── Detect OS & package manager ──────────────────────────────
OS="$(uname -s)"
PKG=""

detect_pkg() {
    case "$OS" in
        Linux)
            if command -v apt-get &>/dev/null; then
                PKG="apt"
            elif command -v dnf &>/dev/null; then
                PKG="dnf"
            else
                err "Unsupported Linux distribution (no apt or dnf found)."
                exit 1
            fi
            ;;
        Darwin)
            if ! command -v brew &>/dev/null; then
                err "Homebrew is required on macOS. Install from https://brew.sh"
                exit 1
            fi
            PKG="brew"
            ;;
        *)
            err "Unsupported OS: $OS"
            exit 1
            ;;
    esac
    info "Detected OS=$OS  package manager=$PKG"
}

# ── Helpers ───────────────────────────────────────────────────
need_sudo() {
    if [[ $EUID -ne 0 ]]; then
        SUDO="sudo"
    else
        SUDO=""
    fi
}

ensure_dir() {
    mkdir -p "$1"
}

FREEROUTING_VERSION="2.1.0"
FREEROUTING_DIR="$HOME/.local/bin"
FREEROUTING_JAR="$FREEROUTING_DIR/freerouting-${FREEROUTING_VERSION}.jar"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# ── 1. Node.js 20+ ───────────────────────────────────────────
install_node() {
    step "Node.js 20+"

    if command -v node &>/dev/null; then
        local ver
        ver="$(node --version)"
        local major
        major="${ver#v}"
        major="${major%%.*}"
        if [[ "$major" -ge 20 ]]; then
            ok "Node.js $ver already installed"
            return
        else
            warn "Node.js $ver found but < 20 — upgrading"
        fi
    fi

    info "Installing Node.js 20..."
    case "$PKG" in
        apt)
            need_sudo
            # NodeSource setup for Node 20.x
            if [[ ! -f /etc/apt/sources.list.d/nodesource.list ]] && \
               [[ ! -f /usr/share/keyrings/nodesource.gpg ]]; then
                $SUDO apt-get update -qq
                $SUDO apt-get install -y -qq ca-certificates curl gnupg
                ensure_dir /etc/apt/keyrings
                curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
                    | $SUDO gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
                echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
                    | $SUDO tee /etc/apt/sources.list.d/nodesource.list >/dev/null
                $SUDO apt-get update -qq
            fi
            $SUDO apt-get install -y -qq nodejs
            ;;
        dnf)
            need_sudo
            $SUDO dnf module enable -y nodejs:20 2>/dev/null || true
            $SUDO dnf install -y nodejs
            ;;
        brew)
            brew install node@20
            brew link --overwrite node@20 2>/dev/null || true
            ;;
    esac
    ok "Node.js $(node --version) installed"
}

# ── 2. KiCad 8+ ──────────────────────────────────────────────
install_kicad() {
    step "KiCad 8+ (for Gerber export)"

    if command -v kicad-cli &>/dev/null || command -v kicad &>/dev/null; then
        local ver
        ver="$(kicad-cli version 2>/dev/null || kicad --version 2>/dev/null || echo 'unknown')"
        ok "KiCad already installed ($ver)"
        return
    fi

    info "Installing KiCad..."
    case "$PKG" in
        apt)
            need_sudo
            $SUDO add-apt-repository -y ppa:kicad/kicad-8.0-releases 2>/dev/null || \
                warn "Could not add KiCad PPA — you may need to install KiCad manually"
            $SUDO apt-get update -qq
            $SUDO apt-get install -y -qq kicad
            ;;
        dnf)
            need_sudo
            $SUDO dnf install -y kicad
            ;;
        brew)
            brew install --cask kicad
            ;;
    esac

    if command -v kicad-cli &>/dev/null || command -v kicad &>/dev/null; then
        ok "KiCad installed"
    else
        warn "KiCad installation may have failed — verify manually"
    fi
}

# ── 3. Java JRE (for Freerouting) ────────────────────────────
install_java() {
    step "Java JRE (for Freerouting)"

    if command -v java &>/dev/null; then
        local ver
        ver="$(java -version 2>&1 | head -1)"
        ok "Java already installed: $ver"
        return
    fi

    info "Installing Java JRE..."
    case "$PKG" in
        apt)
            need_sudo
            $SUDO apt-get update -qq
            $SUDO apt-get install -y -qq default-jre
            ;;
        dnf)
            need_sudo
            $SUDO dnf install -y java-17-openjdk
            ;;
        brew)
            brew install openjdk@17
            # Symlink so `java` is on PATH
            sudo ln -sfn "$(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk" \
                /Library/Java/JavaVirtualMachines/openjdk-17.jdk 2>/dev/null || true
            ;;
    esac
    ok "Java installed: $(java -version 2>&1 | head -1)"
}

# ── 4. Freerouting ───────────────────────────────────────────
install_freerouting() {
    step "Freerouting v${FREEROUTING_VERSION}"

    if [[ -f "$FREEROUTING_JAR" ]]; then
        ok "Freerouting already present at $FREEROUTING_JAR"
        return
    fi

    info "Downloading Freerouting v${FREEROUTING_VERSION}..."
    ensure_dir "$FREEROUTING_DIR"

    local url="https://github.com/freerouting/freerouting/releases/download/v${FREEROUTING_VERSION}/freerouting-${FREEROUTING_VERSION}.jar"
    if curl -fSL --progress-bar -o "$FREEROUTING_JAR" "$url"; then
        ok "Freerouting downloaded to $FREEROUTING_JAR"
    else
        err "Failed to download Freerouting from $url"
        warn "Download manually from https://github.com/freerouting/freerouting/releases"
        rm -f "$FREEROUTING_JAR"
        return
    fi

    # Create a convenience wrapper script
    local wrapper="$FREEROUTING_DIR/freerouting"
    cat > "$wrapper" <<WRAPPER
#!/usr/bin/env bash
exec java -jar "$FREEROUTING_JAR" "\$@"
WRAPPER
    chmod +x "$wrapper"
    ok "Wrapper script created at $wrapper"

    # Ensure ~/.local/bin is on PATH
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        warn "\$HOME/.local/bin is not on your PATH."
        warn "Add to your shell profile:  export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
}

# ── 5. Python3 + west (Zephyr / ZMK) ─────────────────────────
install_west() {
    step "Python3 + west (Zephyr meta-tool for ZMK)"

    # Python3
    if ! command -v python3 &>/dev/null; then
        info "Installing Python3..."
        case "$PKG" in
            apt)  need_sudo; $SUDO apt-get install -y -qq python3 python3-pip python3-venv ;;
            dnf)  need_sudo; $SUDO dnf install -y python3 python3-pip ;;
            brew) brew install python@3 ;;
        esac
    fi
    ok "Python3 $(python3 --version 2>&1 | awk '{print $2}') found"

    # pip / pipx for west
    if command -v west &>/dev/null; then
        ok "west already installed: $(west --version 2>&1 || echo 'present')"
        return
    fi

    info "Installing west via pip..."
    if command -v pipx &>/dev/null; then
        pipx install west 2>/dev/null || python3 -m pip install --user west
    else
        python3 -m pip install --user west 2>/dev/null || \
            python3 -m pip install --break-system-packages --user west 2>/dev/null || \
            warn "Could not install west via pip. Try: pipx install west"
    fi

    if command -v west &>/dev/null; then
        ok "west installed: $(west --version 2>&1 || echo 'present')"
    else
        # Check if it landed in ~/.local/bin but isn't on PATH yet
        if [[ -f "$HOME/.local/bin/west" ]]; then
            ok "west installed at ~/.local/bin/west (may need PATH update)"
        else
            warn "west installation could not be verified — you may need to install it manually"
        fi
    fi
}

# ── 6. npm dependencies in tools/ ────────────────────────────
install_npm_deps() {
    step "npm dependencies (tools/)"

    local tools_dir="$PROJECT_ROOT/src/tools"
    if [[ ! -f "$tools_dir/package.json" ]]; then
        warn "No package.json found in $tools_dir — skipping npm install"
        return
    fi

    if [[ -d "$tools_dir/node_modules" ]]; then
        ok "node_modules already present in tools/"
        info "Running npm install to ensure up-to-date..."
    fi

    (cd "$tools_dir" && npm install)
    ok "npm dependencies installed in tools/"
}

# ── Main ──────────────────────────────────────────────────────
main() {
    printf "\n${BOLD}${CYAN}Keyboard Maker — Toolchain Setup${RESET}\n"
    printf "=================================\n\n"

    detect_pkg

    install_node
    install_kicad
    install_java
    install_freerouting
    install_west
    install_npm_deps

    printf "\n${BOLD}${GREEN}Setup complete.${RESET}\n"
    printf "${CYAN}[info]${RESET}  Run ${BOLD}src/scripts/setup-check.sh${RESET} to verify everything is in order.\n"
    printf "\n"
}

main "$@"
