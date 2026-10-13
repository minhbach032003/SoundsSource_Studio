## ADDED Requirements

### Requirement: Standard Tauri v2 Layout
The project directory SHALL conform to the standard Tauri v2 application layout with a root TypeScript frontend and a `src-tauri` Rust crate.

#### Scenario: Verify Tauri directory layout
- **WHEN** inspecting the project repository
- **THEN** `package.json`, `tsconfig.json`, `index.html` exist at the root and `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` exist under `src-tauri/`.

### Requirement: TypeScript Build Pipeline
The project SHALL support standard TypeScript & Vite compilation for the UI layer.

#### Scenario: Successful frontend build
- **WHEN** running `pnpm build` in the repository root
- **THEN** Vite and TypeScript compile the frontend without errors into the distribution folder.
