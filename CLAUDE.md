# codex.thevinotheca.com

This repository holds the member Chronicle served at codex.thevinotheca.com, built by Cloudflare Pages from the `main` branch. The repository is public and carries every working file in it into publication, this file included. Nothing enters it that is not intended for publication: no working documents, drafts, notes or planning material; no credentials, keys, tokens or connection strings; and no member data of any kind.

## Conventions

1. **The site is built rather than served as written.** Vite, React and TypeScript. The platform runs the build on deploy and serves its output; built output is not committed and stays ignored.

2. **Dependencies are reviewed rather than accumulated.** Each direct dependency is a deliberate addition with a reason. Versions are pinned exactly — never a range, a caret, a tilde or a tag — and the lockfile is committed, so that the platform resolves the tree the operator resolved. The Node version is the one named in `.nvmrc`, and a session confirms `node -v` against it before installing or building, a machine being free to carry a newer Node first on its path. An install reporting a peer conflict is reported and stopped; `--force` and `--legacy-peer-deps` are not passed. Adding or upgrading a dependency is a deliberate edit and is not folded into unrelated work.

3. **Git.** The agent stages files and writes commits. The operator pushes. No branch is created or switched: work stays on the branch the directory is already checked out on, which is `app`. A commit takes its identity from this directory's git configuration; `--author` and `GIT_AUTHOR_*` are never passed, and a commit message carries no trailer — no Co-Authored-By, no session link. A commit message states what changed in plain terms.

4. **Commands are kept to the minimal form that works.** An elaborated command is a deviation to correct, not an improvement. Where the environment forces an addition — a cache directory, a configuration path — the addition is reported rather than adopted silently. Two are known and stand reported: an agent sandbox that denies the user-level npm cache takes `--cache` with a directory inside the sandbox's own temporary space, and one that denies the user-level git configuration runs git with the global configuration disabled — `GIT_CONFIG_GLOBAL=/dev/null git …` — which leaves this directory's own identity in force. **That git form belongs to the sandbox alone**: used in an ordinary terminal it strips the operator's identity, and the commit is then attributed to the hostname.

5. **Nothing is checked piecemeal.** A check over a set of files is run over the whole set at every depth; an incomplete check is widened and re-run whole rather than extended.

6. **A verification reads the value out of the artifact.** A check constructs no expected address, name or version of its own; it takes the one the artifact carries and follows that.

7. **A successful build proves nothing about layout.** Anything whose correctness is visual is accepted on the device. Building, type-checking and previewing are preparation for that check and not a substitute for it.

8. **This file imports nothing** and names no location outside this directory, and no work is done outside it. Work discovered during a task is reported and left.
