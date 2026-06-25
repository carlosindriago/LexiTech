# Contributing to LexiTech

Thank you for your interest in contributing. This document covers the local
setup, Git workflow, commit conventions, and the PR process for LexiTech.

---

## 🚀 Local Setup

```bash
git clone https://github.com/carlosindriago/LexiTech.git
cd LexiTech
git checkout develop
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend (tests only)

```bash
cd extension
npm install
```

### Full stack (Docker)

```bash
export OPENAI_API_KEY="sk-..."
docker compose up -d
```

---

## 🌿 Git Workflow — Gitflow

LexiTech follows a **Gitflow-inspired** branching model with two protected branches:

| Branch | Role |
|---|---|
| `main` | Production code. Receives the final MVP via a PR from `develop`. |
| `develop` | Integration branch. All feature work lands here first. |

### Branch naming

All ephemeral work branches are created from `develop` and named:

```
feature/<short-kebab-description>
fix/<short-kebab-description>
chore/<short-kebab-description>
refactor/<short-kebab-description>
test/<short-kebab-description>
docs/<short-kebab-description>
```

Examples: `feature/backend-core`, `fix/shadow-dom-leak`, `docs/update-readme`.

### Lifecycle of a task

1. **Branch out from `develop`:**
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/<task-name> develop
   ```

2. **Implement with tests** (TDD: tests first, then code, then refactor).

3. **Commit atomically** with [Conventional Commits](#-commit-message-format).

4. **Verify locally** before merging:
   ```bash
   # Backend
   cd backend && pytest -v

   # Frontend
   cd extension && npm test
   ```

5. **Merge into `develop` locally** (no fast-forward, to preserve the feature branch boundary in history):
   ```bash
   git checkout develop
   git merge --no-ff feature/<task-name>
   git branch -d feature/<task-name>
   ```

6. **Push `develop`:** `git push origin develop`.

7. **PR from `develop` to `main`** is opened only when the **entire MVP is complete** and validated. This is a release PR, not a per-feature PR.

---

## 💬 Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/) without scope:

```
<type>: <imperative short description>
```

Allowed types: `feat`, `fix`, `test`, `refactor`, `chore`, `docs`.

Examples:

```
feat: implement context extraction algorithm
fix: scope shadow dom css to prevent host bleed
test: add jest unit tests for text cleaning
docs: clarify local docker setup in README
chore: pin pydantic to 2.9.2
```

**Rules:**

- The subject is in the imperative mood ("add", not "added").
- No period at the end of the subject.
- No scope in parentheses (use a separate `feat(scope): ...` only if the repo
  later adopts one).
- Each commit resolves exactly one concern. Do not bundle unrelated changes.

---

## 🧪 Testing

| Component | Command | Tool |
|---|---|---|
| Backend logic & API | `cd backend && pytest -v` | Pytest |
| Frontend pure functions | `cd extension && npm test` | Jest + jsdom |

**TDD is mandatory for backend work.** Write the failing test first, watch it
fail, then implement the minimum code to pass.

**Frontend tests cover pure logic only** (text cleaning, context extraction).
DOM and Chrome API integration is not unit-tested — it is verified by loading
the unpacked extension and manual smoke tests on a real page.

---

## 🧹 Code Style

### Python

- Full type hints on every public function.
- Frozen + slotted dataclasses for value objects.
- Pydantic models for all API boundaries.
- Parameterized SQL (when DB queries appear).
- `try/except` only for specific exception types; chain with `from err`.
- Use the `logging` module — never `print()` for diagnostics.

### JavaScript

- ES6+ module syntax; no transpilation step.
- No frameworks. Pure DOM API + Shadow DOM.
- Dynamic text via `textContent` or sanitization — **never** `innerHTML` for
  user data or LLM output.
- All `fetch` calls wrapped in `try/catch`; no silent failures.

---

## 📥 Pull Request Process

1. Open the PR **against `develop`** (not `main`).
2. Use the PR template that auto-loads on the GitHub UI.
3. Ensure CI is green (lint + tests).
4. Request review from a maintainer.
5. After approval, squash-merge is preferred for atomicity; preserve the
   commit message subject.

The release PR from `develop` to `main` is opened by the maintainer only
when the MVP is complete.

---

## 🐛 Reporting Bugs

Open an issue with:

- Clear title and a one-paragraph summary.
- Steps to reproduce (URL where the bug appears, the term selected, the
  observed vs. expected output).
- Screenshots or a short screen recording if the bug is visual.
- Chrome version and OS.

---

## 📄 License

By contributing, you agree that your contributions will be licensed under
the [MIT License](./LICENSE).
