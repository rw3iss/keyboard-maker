# Keyboard Maker — Scripts

## setup.sh

Comprehensive setup script that installs all prerequisites for the keyboard-maker toolchain. Detects your OS (Linux with apt/dnf, or macOS with Homebrew) and installs:

| Dependency | Purpose |
|---|---|
| **Node.js 20+** | Runs the keyboard-maker CLI and build tools |
| **npm** | Installs JavaScript dependencies in `tools/` |
| **KiCad 8+** | Gerber/drill file export from PCB designs |
| **Java JRE** | Required to run Freerouting |
| **Freerouting** | Autoroutes PCB traces (downloaded to `~/.local/bin/`) |
| **Python3 + west** | Zephyr meta-tool used for ZMK firmware builds |

The script is idempotent — it skips anything already installed and prints the version found. Run it with:

```bash
./scripts/setup.sh
```

## setup-check.sh

Validates that all prerequisites are installed and prints a status report. Marks KiCad and west as optional (warning only); all other dependencies are critical.

```bash
./scripts/setup-check.sh
```

Exit codes:
- **0** — all critical dependencies present
- **1** — one or more critical dependencies missing

## Requirements

- **Linux**: Ubuntu/Debian (apt) or Fedora (dnf)
- **macOS**: Homebrew must be installed
