# Codex Vini — the member Chronicle

The front end of the member Chronicle, served at
[my.thevinotheca.com](https://my.thevinotheca.com). The repository and the
hosting project keep the name they were created with; it is not the address,
and the old one serves nothing.

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
