# ShopeeFood Delivery DSS — Fleet Dispatch Decision Support System

A web application that supports food-delivery dispatch decisions. The system scores and recommends the most suitable driver for each order; a manager can approve the recommendation or override it with a written reason.

> Academic capstone prototype, not an official ShopeeFood service. Sample data (zones, drivers, restaurants) is synthetic.

---

## 1. About your system

### User roles

| Role | Permissions |
|---|---|
| **Manager** | Create and view orders, manage vehicles, drivers and zones, view DSS recommendations, assign or reassign drivers, review dispatch history, view the reporting dashboard |
| **Driver** | View own profile and assigned orders, update delivery progress |

### Main modules

- **Orders** — create orders with restaurant, food items, delivery coordinates, weight, delivery fee, payment method (prepaid / cash on delivery) and deadline.
- **Fleet Management / Manage Drivers** — manage vehicles (plate number, capacity, cost per km, status, maintenance due date) and drivers (zone, vehicle, status, position).
- **Dispatch (core DSS)** — scores and ranks drivers for each order and explains why a driver is excluded.
- **Dispatch History** — stores every dispatch decision (the latest 200 are shown) together with a snapshot of the candidate list (`candidates_snapshot`).
- **Driver app** — a 5-step delivery workflow; every action is recorded in `order_events`.
- **Dashboard** — completed and failed orders, on-time rate, average delivery time, COD reconciliation, per-driver performance.
- **Accounts** — sign in, sign out, forgot and reset password, email notifications for sign-in and password changes.

### DSS algorithm (`backend/src/dss.js`)

**Step 1 — Hard constraint filtering.** A driver is excluded (with the reason shown) if:

- the driver is offline;
- the vehicle is not `available` (maintenance or inactive);
- the driver serves a different zone than the order, or the zone is inactive;
- the driver already has 3 active orders;
- total load would exceed the vehicle capacity;
- the vehicle maintenance is overdue;
- the driver position is missing.

**Step 2 — Estimation.**

- Haversine distance × 1.3 (road factor).
- Assumed speed of 25 km/h.
- 5 minutes for pickup, plus 5 minutes for each order the driver already holds.

**Step 3 — Scoring (lower is better).**

```
Score = km to restaurant + 4 × active orders + 2 × predicted late minutes
```

The parameters are defined in the `MODEL` object at the top of `dss.js`. Results are **estimates** and do not use live traffic data.

---

## 2. The technical background used

| Layer | Technology |
|---|---|
| Runtime / Backend | Node.js (CommonJS), Express 5 |
| Database | MySQL (local, default `shopeefood_db`, InnoDB) or TiDB Cloud (selected with `DATABASE_TARGET=local\|tidb`, TLS ≥ 1.2) |
| DB driver | mysql2/promise (connection pool, prepared statements) |
| Configuration | dotenv (`.env`, template in `.env.example`) |
| Frontend | Plain HTML + CSS + JavaScript, served statically from `backend/public` |
| Email | Brevo API (optional, called with `fetch`) |
| Testing | `node:test` + `node:assert` (`src/dss.test.js`) |

### Security

- Passwords are hashed with **scrypt** using a random salt and compared with `timingSafeEqual`.
- Sessions are stored **server-side** (`sessions` table, only the SHA-256 hash of the token is stored) and expire after 8 hours.
- Cookie `fleet_session`: `httpOnly`, `sameSite=strict`, plus `secure` when `COOKIE_SECURE=1`.
- A **CSRF token** is required for every write request (POST, PUT).
- Role-based access control; a driver can only act on their own orders.
- Failed-login limit: 15 attempts per 15 minutes per IP.
- Password reset is rate limited and returns a generic response (does not reveal whether an account exists).
- Assignment uses a transaction with row locks (`SELECT ... FOR UPDATE`) to prevent double assignment.

### Data model

`zones`, `vehicles`, `drivers`, `users`, `sessions`, `restaurants`, `orders`, `order_items`, `order_events`, `dispatch_history`, `password_reset_tokens`.

### Project structure

```
backend/
├── server.js            # starts Express, mounts middleware and routes
├── src/                 # auth, orders, fleet, dispatch, dss, driver, reports, mail, password-reset, security, db
├── public/              # HTML/JS UI (login, index, fleet, drivers, dispatch, dashboard, driver, account, ...)
├── sql/                 # schema and sample data (002 → 006, fleet-setup, seed)
└── scripts/             # create-accounts, migrate-to-tidb, export-schema, test-tidb
```

### Main API

| Prefix | Access | Purpose |
|---|---|---|
| `/api/auth` | public / signed in | login, logout, me, forgot-password, reset-password |
| `/api/orders` | Manager | order list, pending orders, restaurants, create order, order detail |
| `/api/fleet` | Manager | vehicles, drivers, zones (view, create, update) |
| `/api/dispatch` | Manager | `GET /:id/recommendations`, `POST /:id/assign`, `GET /history` |
| `/api/driver` | Driver | profile, orders, `POST /orders/:id/progress` |
| `/api/reports` | Manager | dashboard figures |
| `/api/health` | public | database connectivity check |

---

## 3. Log in account

The repository **does not contain a fixed password**. Demo accounts are created by `scripts/create-accounts.js`; the password comes from the `APP_SEED_PASSWORD` environment variable (12–200 characters, no leading or trailing spaces) that you choose yourself.

| Role | Email | Password |
|---|---|---|
| Manager | `manager@demo.local` | the value of `APP_SEED_PASSWORD` |
| Driver | `<lowercase driver code>@demo.local` | the value of `APP_SEED_PASSWORD` |

With the sample data in `sql/fleet-setup.sql`:

| Code | Name | Zone | Email |
|---|---|---|---|
| DRV001 | Jamie Nguyen | Central Hub | `drv001@demo.local` |
| DRV002 | Taylor Tran | Central Hub | `drv002@demo.local` |
| DRV003 | Casey Le | North Hub | `drv003@demo.local` |

Notes:

- The login page has two tabs, **Manager** and **Driver**; choosing the tab that does not match the account role shows an error.
- Existing accounts keep their current password when the script is run again.
- **Forgot password** (`/forgot-password.html`) only works when Brevo email is configured (see below).

---

## 4. The flow of the system

### Step 0 — Setup and run

1. Install MySQL (or use TiDB) and create the database `shopeefood_db`.
2. Run the SQL files in `backend/sql/` in this order:
   `002-dispatch.sql` → `003-auth.sql` → `fleet-setup.sql` → `004-food-orders.sql` → `005-delivery-progress.sql`
   (optional: `seed-orders.sql.sql` for sample orders).
   These files assume the base `orders` table already exists. If you are building a brand-new database, use `006-tidb-schema.sql` (the full schema).
3. In `backend/`, create the configuration file:
   ```bash
   cp .env.example .env
   # fill in DB_PASSWORD and any other required values
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Create the demo accounts:
   ```bash
   APP_SEED_PASSWORD="your-password-12-chars-min" node scripts/create-accounts.js
   ```
6. Start the server:
   ```bash
   npm start
   ```
7. Open `http://127.0.0.1:3000/login.html`.
8. (Optional) Run the DSS algorithm tests:
   ```bash
   node --test src/dss.test.js
   ```

### Environment variables

| Variable | Meaning |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | local MySQL connection |
| `DATABASE_TARGET` | `local` (default) or `tidb` |
| `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE` | TiDB connection (when `DATABASE_TARGET=tidb`) |
| `PORT`, `HOST` | listening port (default 3000) and address (default `127.0.0.1`) |
| `COOKIE_SECURE` | set to `1` when serving over HTTPS |
| `TRUST_PROXY` | set to `1` when running behind a reverse proxy |
| `APP_SEED_PASSWORD` | password used by `create-accounts.js` |
| `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `APP_PUBLIC_URL` | email delivery (optional) |

### Manager flow

1. **Sign in** on the Manager tab.
2. **Orders (`/`)** — create a new order (order code, customer, phone, address, restaurant, coordinates, weight, delivery fee, prepaid/cash, deadline, food items). The order starts as `pending`.
3. **Fleet Management / Manage Drivers** — check, add or edit vehicles and drivers so dispatch data is accurate.
4. **Dispatch (`/dispatch.html`)** — select an order that has not started delivery; the system shows a ranked candidate table: score, distance, ETA, predicted late minutes, and the exclusion reason (if any).
5. **Approve or override**
   - Choose the recommended driver → recorded as `recommended`.
   - Choose a different driver, or reassign an already assigned order → a **reason is required** (1–500 characters), recorded as `override`.
   - The order becomes `assigned`; estimated distance, time and cost are stored.
6. **Dispatch History** — review every decision and its reason.
7. **Dashboard** — track KPIs: on-time rate, completed, failed, COD, per-driver performance.

### Driver flow

1. **Sign in** on the Driver tab → go to `/driver.html`.
2. View the list of assigned orders and the details of each.
3. Perform the actions in order (`POST /api/driver/orders/:id/progress`):

| Action | Meaning | Result |
|---|---|---|
| `start` | Start heading to the restaurant (checks driver is available, vehicle is ready, maintenance is not overdue, load is valid) | `assigned` → `delivering` |
| `arrive` | Confirm arrival at the restaurant | event recorded |
| `pickup` | Confirm food pickup; the correct order code must be entered | event recorded |
| `complete` | Delivered successfully; enter the COD amount collected | `completed` |
| `fail` | Delivery failed (with a reason) | `failed` |

4. Every action is written to `order_events` for traceability.

### Order status

```
pending / confirmed ──► assigned ──► delivering ──► completed
                                          └──────► failed
(cancelled: cancellation status)
```

---

## Notes

- The setup steps were derived from the code structure; verify the SQL execution order against your own database.
- Times are stored in UTC in the database; the UI and emails use Vietnam time.
- `Intro.html` in the repository root is only a greeting page and is not part of the main system.
