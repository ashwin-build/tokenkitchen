# Project Plan

**Status**: Approved
**Created**: 2026-10-04
**Mode**: AUGMENT

---

## 1. Project Overview

**Goal**: Build TokenKitchen as a multi-tenant SaaS for Indian food businesses, covering kitchen queue workflows, inventory, billing, GST-aware reporting, and subscription management. The project is designed so that every module is independently testable.

**App Type**: SPA + API

**API Login**: Yes

**Mode**: AUGMENT

**Deployment Plan**: No deployment plan found

---

## 2. TokenKitchen API — Backend

| Component | Technology |
|-----------|-----------|
| **Language** | TypeScript |
| **Runtime** | Node |
| **Package Manager** | npm |
| **Test Runner** | vitest |
| **Mocking Library** | vi.mock |
| **Test Command** | npm test |
| **Orchestration** | docker-compose |

> **Language vs Runtime**: `Language` is the source language the user picked in this service's `language` question. `Runtime` is the execution runtime — default `Node` for TypeScript/JavaScript, `CPython` for Python, `.NET` for C#. Only deviate from the default (e.g. `Bun`, `Deno`, `PyPy`) when the user explicitly asks. **Package Manager and Test Runner are language-dependent** — match them to this service's Language (e.g. C# → `dotnet (NuGet)` + `xUnit`/`NUnit`/`MSTest`). The `Orchestration` row is recorded for the scaffold step but hidden in the plan UI — always keep it set to `docker-compose`.

---

## 3. Customer Web App — Frontend

| Component | Technology |
|-----------|-----------|
| **Language** | TypeScript |
| **Framework** | React + Vite |
| **Package Manager** | npm |
| **Test Runner** | vitest |
| **Mocking Library** | vi.mock |
| **Test Command** | npm test |

---

## 4. Services Required

| Azure Service | Role in App | Environment Variable | Default Value (Local) | Classification |
|---------------|------------|---------------------|----------------------|----------------|
| PostgreSQL | Primary data store for tenants, orders, inventory, GST records, and billing history | DATABASE_URL | postgresql://tokenkitchen:tokenkitchen@localhost:5433/tokenkitchen?schema=public | Essential |

---

## 5. Prerequisites

### Run

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Node.js | TokenKitchen API, Customer Web App | ✅ | v24.16.0 |
| npm | TokenKitchen API, Customer Web App | ✅ | 11.13.0 |
| Docker | TokenKitchen API | ✅ | Docker version 29.5.2 |
| Docker Compose | TokenKitchen API | ✅ | Docker Compose version v5.1.3 |

### Debug

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Docker | TokenKitchen API | ✅ | Docker version 29.5.2 |
| Docker Compose | TokenKitchen API | ✅ | Docker Compose version v5.1.3 |
| Chrome | Customer Web App | ✅ | Google Chrome 154.0.8037.97 |

---

## 6. Design System & UI

**Component Library**: Fluent UI v9
**Style Direction**: Modern operations dashboard for a food business: crisp order-status panels, warm accents inspired by fresh ingredients, clean card layouts, and high-contrast tables for inventory and billing decisions.
**Typography**: Inter, system-ui

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#FF6B57` | Main actions, active queue states, primary navigation |
| `accent` | `#F5B942` | Highlights for sales, kitchen urgency, and KPI chips |
| `surface` | `#F7F4F1` | Page and dashboard backgrounds |
| `text` | `#1F2937` | Body text and table headers |
| `muted` | `#6B7280` | Secondary metadata, timestamps, and captions |
| `border` | `#E5E7EB` | Dividers, form fields, and table borders |

### Pages

| Page | Route | Purpose | Layout |
|------|-------|---------|--------|
| Dashboard | `/dashboard` | Overview of live sales, queue volume, and low-stock alerts | `header + main + card-list + table` |
| Orders | `/dashboard/orders` | Track queued, in-progress, and ready orders across the kitchen | `header + table + actions` |
| Catalog | `/dashboard/catalog` | Manage ingredients, dishes, and recipe costings | `header + sidebar + table + actions` |
| Billing | `/dashboard/billing` | Review GST bills, daily sales, and credit customer activity | `header + main + table + action-bar` |

### Sample Content

```
Dashboard — Orders:
| Order # | Table | Items | Amount | Status |
| 1042 | 8 | Butter Chicken, Naan | ₹1,280 | Ready |
| 1045 | 12 | Veg Thali, Masala Tea | ₹720 | Cooking |
| 1048 | 3 | Tandoori Momos, Coke | ₹560 | Queued |

Catalog — Ingredients:
| Ingredient | Unit | Stock | Reorder | Cost |
| Onion | kg | 18.5 | 8 | ₹42 |
| Chicken | kg | 6.2 | 5 | ₹210 |
| Rice | kg | 24 | 10 | ₹38 |

Orders — Queue:
| Token | Item | ETA | Kitchen Stage |
| 27 | Paneer Roll | 6 min | Grill |
| 28 | Veg Biryani | 9 min | Prep |
| 29 | Cold Coffee | 3 min | Pickup |

Billing — Sales Summary: Today ₹34,250 · GST ₹5,445 · Credit Receivables ₹4,120
```

---

## 7. Project Structure

```
tokenkitchen/
├─ src/
│  ├─ app/
│  │  ├─ api/
│  │  │  ├─ catalog/
│  │  │  └─ health/
│  │  ├─ dashboard/
│  │  │  ├─ billing/
│  │  │  ├─ catalog/
│  │  │  ├─ orders/
│  │  │  └─ page.tsx
│  │  ├─ onboarding/
│  │  ├─ sign-in/
│  │  └─ sign-up/
│  ├─ lib/
│  └─ server/
│     ├─ auth/
│     ├─ catalog/
│     ├─ db/
│     └─ system/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ docker-compose.yml
├─ package.json
├─ next.config.ts
├─ README.md
├─ server.js
├─ license.js
├─ scripts/
├─ vitest.config.mts
├─ vitest.integration.config.mts
├─ tsconfig.json
├─ eslint.config.mjs
├─ postcss.config.mjs
└─ .env.example
```

---

## 8. Route Definitions

| # | Method | Path | Description | Request Body | Response Body | Status Codes |
|---|--------|------|-------------|-------------|--------------|-------------|
| 1 | GET | `/api/health` | Health check for backend and database connectivity | — | `{ status, services }` | 200, 503 |
| 2 | GET | `/api/dashboard/summary` | Retrieve live sales, low-stock warnings, and queue counts | — | `{ todaySales, queuedOrders, stockAlerts }` | 200 |
| 3 | GET | `/api/catalog/ingredients` | List ingredients and stock metadata for the active tenant | — | `{ items: [...] }` | 200 |
| 4 | POST | `/api/catalog/import` | Import recipe or ingredient CSV data | `{ csv, mode }` | `{ imported, skipped, errors }` | 200, 400, 409 |
| 5 | GET | `/api/billing/reports` | Return daily settlement, GST, and receivables summary | — | `{ totals, gst, dues }` | 200 |
| 6 | POST | `/api/orders/queue` | Create or update an order state for the kitchen queue | `{ orderId, status }` | `{ orderId, status, updatedAt }` | 200, 400 |

---

## 9. Next Steps

1. Run **azure-project-scaffold** to execute this plan
2. Run **azure-project-integrate** to wire the frontend to live data, smoke-test the backend, and create the migrations
3. Run **azure-debug-plan** → **azure-debug-generate** for Docker emulators and VS Code debugging
4. Run the **azure-deploy** agent when ready; it uses **azure-app-onboard** for architecture, cost estimation, IaC generation, provisioning, and health verification
