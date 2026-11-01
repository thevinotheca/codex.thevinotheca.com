# Codex Vini — the member Chronicle

The front end of the member Chronicle, served at
[codex.thevinotheca.com](https://codex.thevinotheca.com).

Part of [Vinotheca](https://thevinotheca.com). The Library is published
separately from its own repository and its own hosting project.

## Toolchain

Vite, React and TypeScript. The hosting platform builds the application on
deploy; built output is not committed.

Dependency versions are pinned exactly and the lockfile is committed. Node is
pinned to 24 in `.nvmrc`; the platform builds under the same major the
lockfile was resolved with.

## Working locally

    npm install
    npm run dev
    npm run build
    npm test

The tests run under Node's built-in runner against an in-memory IndexedDB
(`fake-indexeddb`).
