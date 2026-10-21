import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = path.resolve(".");
const distDir = path.join(rootDir, "dist");
const sdkDir = path.join(distDir, "nova-sdk");

console.log("Building Nova SDK standalone distribution package...");

// 1. Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(sdkDir, { recursive: true });

// 2. Directories and files to copy
const copyItems = [
  { src: "bin", dest: "bin" },
  { src: "ndk", dest: "ndk" },
  { src: "nova/src", dest: "nova/src" },
  { src: "nvm/src", dest: "nvm/src" },
  { src: "examples", dest: "examples" },
  { src: "setup.bat", dest: "setup.bat" },
  { src: "setup.sh", dest: "setup.sh" },
  { src: "install.ps1", dest: "install.ps1" },
  { src: "install.sh", dest: "install.sh" },
];

for (const item of copyItems) {
  const srcPath = path.join(rootDir, item.src);
  const destPath = path.join(sdkDir, item.dest);

  if (!fs.existsSync(srcPath)) {
    console.warn(`Warning: ${srcPath} does not exist, skipping.`);
    continue;
  }

  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.mkdirSync(destPath, { recursive: true });
    fs.cpSync(srcPath, destPath, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

// 3. Create a clean standalone distribution README.md
const distReadme = `# Nova SDK: Standalone Language & Virtual Machine

Welcome to the Nova Standalone SDK! This package contains everything needed to compile and run Nova programs on the Nova Virtual Machine (NVM).

## Quick Setup

### On Windows:
Double-click \`setup.bat\` in this directory, or add this folder's \`bin\` directory to your User PATH manually:
1. Open Start Menu -> search **Environment Variables**.
2. Edit User variable **Path**.
3. Add the full path to this directory's \`bin\` folder (e.g. \`C:\\nova-sdk\\bin\`).

### On macOS / Linux:
Run the setup script:
\`\`\`bash
chmod +x setup.sh && ./setup.sh
\`\`\`
Or add to your \`~/.bashrc\` or \`~/.zshrc\`:
\`\`\`bash
export PATH="/path/to/nova-sdk/bin:$PATH"
\`\`\`

---

## Verifying Installation

Open a new terminal window:
\`\`\`bash
novac --help
nova --help
\`\`\`

## Running Your First Program

\`\`\`bash
# Run the included example directly:
nova examples/hello.nova

# Or compile to an .nvm binary, then run:
novac examples/hello.nova -o hello.nvm
nova hello.nvm
\`\`\`
`;

fs.writeFileSync(path.join(sdkDir, "README.md"), distReadme, "utf8");

// 4. Create ZIP archive using PowerShell on Windows, or zip on Linux/macOS
const zipPath = path.join(distDir, "nova-sdk.zip");
console.log(`Compressing distribution to ${zipPath}...`);

try {
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${sdkDir}\\*' -DestinationPath '${zipPath}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`cd "${sdkDir}" && zip -r "${zipPath}" ./*`, { stdio: "inherit" });
  }
  console.log(`\nSuccessfully created standalone distribution package:`);
  console.log(`  Folder:  ${sdkDir}`);
  console.log(`  Archive: ${zipPath}`);
} catch (err) {
  console.error("Compression error:", err.message);
}

