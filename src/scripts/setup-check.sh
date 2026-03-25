#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Keyboard Maker — Prerequisites Check
# Validates all toolchain dependencies and prints a status report.
# Exit 0 if all critical deps present, 1 if any critical dep missing.
# ──────────────────────────────────────────────────────────────

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

PASS="${GREEN}✓${RESET}"
FAIL="${RED}✗${RESET}"
WARN="${YELLOW}!${RESET}"

critical_missing=0
optional_missing=0

FREEROUTING_DIR="$HOME/.local/bin"

# ── Check helpers ─────────────────────────────────────────────

# check_critical <label> <command> <version_args> <min_hint>
check_critical() {
    local label="$1"
    local cmd="$2"
    local ver_args="${3:-}"
    local hint="${4:-}"

    if command -v "$cmd" &>/dev/null; then
        local ver
        if [[ -n "$ver_args" ]]; then
            ver="$($cmd $ver_args 2>&1 | head -1)" || ver="present"
        else
            ver="present"
        fi
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$ver"
    else
        printf "  ${FAIL} %-18s ${RED}not found${RESET}" "$label"
        if [[ -n "$hint" ]]; then
            printf " — %s" "$hint"
        fi
        printf "\n"
        critical_missing=$((critical_missing + 1))
    fi
}

# check_optional <label> <command> <version_args> <hint>
check_optional() {
    local label="$1"
    local cmd="$2"
    local ver_args="${3:-}"
    local hint="${4:-}"

    if command -v "$cmd" &>/dev/null; then
        local ver
        if [[ -n "$ver_args" ]]; then
            ver="$($cmd $ver_args 2>&1 | head -1)" || ver="present"
        else
            ver="present"
        fi
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$ver"
    else
        printf "  ${WARN} %-18s ${YELLOW}not found${RESET}" "$label"
        if [[ -n "$hint" ]]; then
            printf " — %s" "$hint"
        fi
        printf "\n"
        optional_missing=$((optional_missing + 1))
    fi
}

# ── Special checks ────────────────────────────────────────────

check_node() {
    local label="Node.js"
    if command -v node &>/dev/null; then
        local ver
        ver="$(node --version)"
        local major="${ver#v}"
        major="${major%%.*}"
        if [[ "$major" -ge 20 ]]; then
            printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$ver"
        else
            printf "  ${FAIL} %-18s ${RED}%s (need v20+)${RESET}\n" "$label" "$ver"
            critical_missing=$((critical_missing + 1))
        fi
    else
        printf "  ${FAIL} %-18s ${RED}not found${RESET}\n" "$label"
        critical_missing=$((critical_missing + 1))
    fi
}

check_java() {
    local label="Java"
    if command -v java &>/dev/null; then
        local ver
        ver="$(java -version 2>&1 | head -1)"
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$ver"
    else
        printf "  ${FAIL} %-18s ${RED}not found — needed for Freerouting${RESET}\n" "$label"
        critical_missing=$((critical_missing + 1))
    fi
}

check_freerouting() {
    local label="Freerouting"

    # Check wrapper on PATH first
    if command -v freerouting &>/dev/null; then
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$(which freerouting)"
        return
    fi

    # Check for JAR directly
    local found_jar=""
    for jar in "$FREEROUTING_DIR"/freerouting-*.jar; do
        if [[ -f "$jar" ]]; then
            found_jar="$jar"
            break
        fi
    done

    if [[ -n "$found_jar" ]]; then
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$found_jar"
    else
        printf "  ${FAIL} %-18s ${RED}not found — needed for PCB autorouting${RESET}\n" "$label"
        critical_missing=$((critical_missing + 1))
    fi
}

check_kicad() {
    local label="KiCad"
    if command -v kicad-cli &>/dev/null; then
        local ver
        ver="$(kicad-cli version 2>/dev/null || echo 'present')"
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$ver"
    elif command -v kicad &>/dev/null; then
        local ver
        ver="$(kicad --version 2>/dev/null || echo 'present')"
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$ver"
    else
        printf "  ${WARN} %-18s ${YELLOW}not found — needed for Gerber export${RESET}\n" "$label"
        optional_missing=$((optional_missing + 1))
    fi
}

check_west() {
    local label="west"
    if command -v west &>/dev/null; then
        local ver
        ver="$(west --version 2>&1 || echo 'present')"
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "$ver"
    elif [[ -f "$HOME/.local/bin/west" ]]; then
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "~/.local/bin/west (not on PATH)"
    else
        printf "  ${WARN} %-18s ${YELLOW}not found — needed for ZMK firmware builds${RESET}\n" "$label"
        optional_missing=$((optional_missing + 1))
    fi
}

check_npm_deps() {
    local label="npm deps"
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local tools_dir="$(dirname "$(dirname "$script_dir")")/src/tools"

    if [[ -d "$tools_dir/node_modules" ]]; then
        printf "  ${PASS} %-18s ${DIM}%s${RESET}\n" "$label" "src/tools/node_modules"
    else
        printf "  ${FAIL} %-18s ${RED}not installed — run npm install in src/tools/${RESET}\n" "$label"
        critical_missing=$((critical_missing + 1))
    fi
}

# ── Main ──────────────────────────────────────────────────────
main() {
    printf "\n${BOLD}${CYAN}Keyboard Maker — Prerequisites Check${RESET}\n"
    printf "=====================================\n\n"

    check_node
    check_critical  "npm"       npm       "--version"  ""
    check_kicad
    check_java
    check_freerouting
    check_critical  "Python3"   python3   "--version"  ""
    check_west
    check_npm_deps

    printf "\n"

    # Summary
    if [[ $critical_missing -eq 0 && $optional_missing -eq 0 ]]; then
        printf "${GREEN}${BOLD}All prerequisites installed.${RESET}\n"
    elif [[ $critical_missing -eq 0 ]]; then
        printf "${GREEN}${BOLD}All critical prerequisites installed.${RESET}\n"
        printf "${YELLOW}${optional_missing} optional tool(s) missing (see warnings above).${RESET}\n"
    else
        printf "${RED}${BOLD}${critical_missing} critical prerequisite(s) missing.${RESET}\n"
        if [[ $optional_missing -gt 0 ]]; then
            printf "${YELLOW}${optional_missing} optional tool(s) also missing.${RESET}\n"
        fi
        printf "\nRun ${BOLD}src/scripts/setup.sh${RESET} to install missing dependencies.\n"
    fi
    printf "\n"

    # Exit code: only fail on critical missing
    if [[ $critical_missing -gt 0 ]]; then
        exit 1
    fi
    exit 0
}

main "$@"
