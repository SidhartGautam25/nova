# Nova SDK: Standalone Language & Virtual Machine

Welcome to the Nova Standalone SDK! This package contains everything needed to compile and run Nova programs on the Nova Virtual Machine (NVM).

## Quick Setup

### On Windows:
Double-click `setup.bat` in this directory, or add this folder's `bin` directory to your User PATH manually:
1. Open Start Menu -> search **Environment Variables**.
2. Edit User variable **Path**.
3. Add the full path to this directory's `bin` folder (e.g. `C:\nova-sdk\bin`).

### On macOS / Linux:
Run the setup script:
```bash
chmod +x setup.sh && ./setup.sh
```
Or add to your `~/.bashrc` or `~/.zshrc`:
```bash
export PATH="/path/to/nova-sdk/bin:$PATH"
```

---

## Verifying Installation

Open a new terminal window:
```bash
novac --help
nova --help
```

## Running Your First Program

```bash
# Run the included example directly:
nova examples/hello.nova

# Or compile to an .nvm binary, then run:
novac examples/hello.nova -o hello.nvm
nova hello.nvm
```
