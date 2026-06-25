# LexiTech

> Open-source Chrome extension that explains English technical terms based on their surrounding DOM context — powered by a privacy-first FastAPI backend that hides the OpenAI API key from the browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=google-chrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)

---

## 🏗 Architecture

LexiTech is a two-tier system with a hard security boundary: **the extension never holds secrets**.

```
┌──────────────────────────────────────────────────────────────┐
│                    Chrome Browser (User)                      │
│  ┌────────────────┐  msg   ┌────────────────┐                 │
│  │  content.js    │───────▶│ background.js  │                 │
│  │  (Shadow DOM)  │        │  (SW proxy)    │                 │
│  │  Text select,  │◀───────│  fetch proxy   │                 │
│  │  Popover UI    │  reply │  (CSP bypass)  │                 │
│  └────────────────┘        └────────┬───────┘                 │
└──────────────────────────────────────┼───────────────────────┘
                                       │ HTTPS (localhost:8000)
                                       ▼
┌──────────────────────────────────────────────────────────────┐
│                FastAPI Backend (Docker)                        │
│  ┌──────────────────────────────────────┐                     │
│  │  POST /api/v1/explain                │                     │
│  │  ├─ Pydantic request validation      │                     │
│  │  ├─ Redis cache lookup               │                     │
│  │  ├─ OpenAI gpt-4o-mini               │                     │
│  │  │   response_format=Explanation     │                     │
│  │  └─ Pydantic response validation     │                     │
│  └──────────────────────────────────────┘                     │
│  ┌────────────────┐    ┌────────────────┐                     │
│  │  Redis:7       │    │  OpenAI API    │                     │
│  │  (cache)       │    │  (gpt-4o-mini) │                     │
│  └────────────────┘    └────────────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

### Component responsibilities

| Component | Role | Key Constraint |
|---|---|---|
| `extension/content.js` | Text selection capture, context extraction, Shadow DOM popover | All dynamic text via `textContent`; no `innerHTML` |
| `extension/background.js` | Service Worker; HTTP proxy to backend (bypasses host CSP) | No API keys here; only message routing |
| `backend/main.py` | FastAPI app, Redis cache, OpenAI proxy | Reads `OPENAI_API_KEY` from env; never logs it |
| `backend/schemas.py` | Pydantic models enforcing 12 pedagogical fields | Strict types via Pydantic Structured Outputs |

### Why a backend proxy?

Direct calls from the extension to OpenAI would expose the API key in the bundle. Worse, they would be blocked by the host website's Content Security Policy (CSP). The background service worker acts as a private tunnel: it receives messages from the content script and performs the network fetch in an origin the host page can't control.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Chrome MV3, Vanilla JS (ES6+), Shadow DOM, Web Speech API |
| Backend | Python 3.11, FastAPI, Pydantic v2, OpenAI SDK (`gpt-4o-mini`), Redis 7 |
| Infrastructure | Docker, Docker Compose, multi-stage builds |
| Testing | Pytest (backend), Jest + jsdom (frontend pure functions) |

**Zero UI frameworks** on the frontend — no React, no Vue, no Tailwind. Shadow DOM provides style isolation natively.

---

## 🚀 Local Setup

### Prerequisites

- Python 3.11+
- Node.js 20+ (for running frontend tests)
- Docker + Docker Compose (for running the full stack)
- An OpenAI API key (for `/api/v1/explain`)

### 1. Clone and enter

```bash
git clone https://github.com/carlosindriago/LexiTech.git
cd LexiTech
git checkout develop
```

### 2. Backend (local dev)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export OPENAI_API_KEY="sk-..."   # Windows: set OPENAI_API_KEY=sk-...
uvicorn main:app --reload --port 8000
```

Smoke test: `curl http://localhost:8000/health` → `{"status": "ok"}`.

### 3. Backend (Docker — full stack)

```bash
cd <repo-root>
export OPENAI_API_KEY=***   # ← insert your real OpenAI API key
docker compose up -d
docker compose logs -f web-api
curl http://localhost:8000/health
```

### 4. Chrome Extension

```bash
cd extension
npm install
```

Then in Chrome:

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `extension/` directory
4. The LexiTech icon appears in the toolbar; the context menu item **"Explain Contextually"** is registered on any page

---

## 🧪 Testing

### Backend (TDD)

```bash
cd backend
pytest -v
```

The test suite uses FastAPI's `TestClient` with mocked OpenAI/Redis — no network calls during the test run.

### Frontend (pure-function unit tests)

```bash
cd extension
npm install
npm test
```

Jest is configured with the `jsdom` environment so pure logic (context extraction, text cleaning) is testable without a browser.

---

## 📂 Project Structure

```
LexiTech/
├── backend/                  FastAPI service
│   ├── main.py               App, routes, Redis, OpenAI client
│   ├── schemas.py            Pydantic request/response models
│   ├── test_main.py          Pytest suite (TDD)
│   └── requirements.txt      Pinned dependencies
├── extension/                Chrome MV3 extension (unpacked)
│   ├── manifest.json         Permissions, host permissions, SW
│   ├── background.js         Service Worker (HTTP proxy)
│   ├── content.js            Text selection + Shadow DOM popover
│   └── package.json          Jest config (frontend tests)
├── docker-compose.yml        web-api + redis:7-alpine
├── Dockerfile                Multi-stage Python 3.11-slim
├── LICENSE                   MIT
├── README.md                 This file
├── CONTRIBUTING.md           Workflow + PR process
├── CODE_OF_CONDUCT.md        Contributor Covenant v2.1
└── .gitignore                Standard Python + Node ignores
```

---

## 🔒 Security Posture

LexiTech is built around a **Zero-Trust** architecture:

- **No API keys in the extension.** All LLM calls route through the backend.
- **Shadow DOM isolation.** The popover UI is encapsulated in an open Shadow Root attached to `<body>`. Host page CSS cannot reach inside.
- **No `innerHTML` for dynamic data.** LLM output and user selections are inserted with `textContent` or sanitization helpers.
- **Pydantic Structured Outputs.** The LLM is constrained to a strict JSON schema; raw text from the model is never trusted.
- **CSP-safe networking.** `fetch` from the content script would be blocked by most hosts; the background service worker proxies the request in a privileged origin.

If you find a security issue, please open a private issue or email the maintainer — do not file a public ticket for exploitable bugs.

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the Git workflow, branch naming, commit message format, and PR template.

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community standards.

---

## 📄 License

[MIT](./LICENSE) — Copyright (c) 2025 Carlos Indriago.
