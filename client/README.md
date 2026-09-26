# MedShield — Frontend

React + Tailwind CSS frontend for the MedShield AI Insurance Policy Intelligence platform.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (Vite) |
| Styling | Tailwind CSS 3 + custom design system |
| HTTP Client | Axios with JWT interceptors |
| Real-time | WebSocket (streaming chat) |
| Charts | Recharts |
| Icons | Lucide React |

## Project Structure

```
client/
├── public/                    # Static assets
├── src/
│   ├── main.jsx               # App entry point
│   ├── App.jsx                # Root layout + routing
│   ├── index.css              # Global design system (tokens, components)
│   │
│   ├── constants/
│   │   └── index.js           # API URLs, policy types, treatments, etc.
│   │
│   ├── context/
│   │   └── AuthContext.jsx    # JWT auth state (login, register, logout)
│   │
│   ├── services/
│   │   └── api.js             # Axios instance with JWT interceptors
│   │
│   ├── hooks/
│   │   ├── usePolicies.js     # Fetch / delete policies
│   │   └── useWebSocket.js    # WebSocket connection + message sending
│   │
│   └── components/
│       ├── common/
│       │   ├── Navbar.jsx     # Sidebar (desktop) + mobile top bar + drawer
│       │   └── ui.jsx         # Shared primitives (Button, Badge, Toggle, etc.)
│       │
│       ├── auth/
│       │   └── AuthModal.jsx  # Login & Register forms
│       │
│       ├── dashboard/
│       │   ├── DashboardView.jsx      # Overview metrics + policy grid
│       │   ├── PolicyCard.jsx         # Individual policy card
│       │   ├── PolicyFactsModal.jsx   # Extracted facts viewer
│       │   └── UploadPolicyModal.jsx  # Drag-and-drop PDF upload + pipeline progress
│       │
│       ├── chat/
│       │   └── ChatBox.jsx    # AI chat with WebSocket streaming + REST fallback
│       │
│       ├── cost/
│       │   └── CostEstimatorView.jsx  # Treatment cost breakdown + what-if simulator
│       │
│       └── comparison/
│           └── ComparisonView.jsx     # Side-by-side policy comparison table
│
├── .env.example               # Environment variable template
├── tailwind.config.js         # Tailwind design tokens
├── vite.config.js             # Vite build config
└── package.json
```

## Getting Started

### Prerequisites
- Node.js 18+
- Backend server running (see `../server/README.md`)

### Setup

```bash
# 1. Install dependencies
cd client
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env if backend runs on a different port

# 3. Start development server
npm run dev
```

App runs at **http://localhost:5173**

### Demo Credentials
```
Email:    demo@medshield.ai
Password: password123
```
Run `npm run seed` from the project root first to create the demo user.

## Key Design Decisions

### Light Mode Design System
- Page background: `#f5f5f7` (Apple light gray)
- Cards: `#ffffff` with `rgba(0,0,0,0.08)` border
- Primary text: `#1d1d1f` (Apple near-black)
- Typography: Inter (Google Fonts)
- Accent: Zinc-900 for primary actions

### WebSocket Chat Architecture
`ChatBox` connects to `ws://localhost:5001/ws/chat` on mount and streams AI responses token-by-token. If the WebSocket is unavailable, it automatically falls back to `POST /api/chat/message`.

### API Integration
All REST calls go through `src/services/api.js` which automatically attaches the JWT token from `localStorage` to every request via an Axios interceptor.

## Scripts

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```
