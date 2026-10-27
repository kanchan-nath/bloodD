# Antigravity Build Prompt — Blood Bank Management System (JavaScript Backend)

Build a complete, runnable college DBMS project named **Blood Bank Management System** in the current workspace. Keep it suitable for a student project: functional, responsive, moderate in difficulty, and easy to explain during a DBMS viva. Do not make it unnecessarily complicated.

## 1. Inspect the starter files first
- Read `README.md` and `blood_bank_management.sql`.
- Inspect the synthetic CSV files in `dataset/`.
- Preserve the supplied MySQL schema, table names, column names, foreign keys, and ENUM values. Do not replace MySQL with SQLite or silently redesign the schema.
- Give a short plan and then build the application end-to-end. Do not stop after creating a static UI or mockup. Choose sensible defaults without asking questions.

## 2. Required technology — JavaScript, not Python
- Backend: **Node.js 20+ with Express**.
- Database: **MySQL 8** using `mysql2/promise` and parameterized SQL queries.
- Frontend: HTML, CSS, and vanilla JavaScript.
- Views: EJS templates rendered by Express.
- Configuration: `dotenv` and `.env`.
- Sessions: `express-session` with a MySQL-backed session store where practical.
- Security/usability: `helmet`, server-side validation, CSRF protection, login rate limiting, and secure session cookie settings appropriate for local development.
- Password hashing: use Node's built-in `crypto` PBKDF2 functions. The supplied SQL seed uses Werkzeug-compatible hashes in the format `pbkdf2:sha256:600000$salt$hex_digest`. Implement a small helper to verify that format and to generate the same format for any new passwords. Do not require Python and do not change the `users` schema. Compare digests with a timing-safe comparison.
- Do not use Flask, Python, SQLite, React, or a cloud database.
- Include `package.json`, `.env.example`, `.gitignore`, and a complete `README.md`.

Use a clear structure such as:
- `server.js`
- `db/pool.js`
- `middleware/auth.js`
- `routes/`
- `views/`
- `public/css/`
- `public/js/`
- `tests/` (for focused tests if practical)

Keep the code commented, modular, and suitable for a student to understand.

## 3. Project purpose and safety boundary
The application manages fictional donors, donation records, inventory batches, hospital requests, and stock issues. It is an academic demonstration using synthetic data, not a real blood-bank system. Do not implement medical advice, donor eligibility decisions, blood-group compatibility advice, or clinical allocation recommendations. Explain in the UI and README that real release and issue decisions require qualified staff, applicable screening, compatibility testing, and approved procedures.

## 4. Login and access control
- Implement login and logout with hashed passwords and server-side sessions.
- Seeded demo accounts: `admin` / `Admin@123` and `staff` / `Staff@123`.
- The SQL data already contains PBKDF2 hashes in Werkzeug's format; verify those correctly in Node with `crypto.pbkdf2`/`pbkdf2Sync` using the hash's iteration count, salt, and expected digest length.
- Do not store or log plaintext passwords.
- Protect all management pages and POST actions. Restrict destructive and approval/issue actions to authorized roles where appropriate.
- Use POST for changes and deletions, never GET.

## 5. Dashboard
All numbers must come from MySQL, not hard-coded values. Show:
- Total donors.
- Donations awaiting screening.
- Available units grouped by blood group.
- Pending requests and emergency requests.
- Batches expiring in the next 14 days.
- Recent donations and recent requests.

## 6. Donor management (CRUD)
- List, add, view, edit, and delete donors.
- Search by donor name, donor code, city, and blood group.
- Validate fields on the server and show friendly errors.
- Prevent donor deletion if any donation references that donor.

## 7. Donation management
- Record a donation for an existing donor; list and filter donations by status/date.
- Support existing schema statuses: `PENDING`, `CLEARED`, `DEFERRED`, `REJECTED`.
- Only a `CLEARED` donation may create an inventory batch.
- When clearing a donation, create exactly one inventory batch and one `DONATION_IN` stock movement inside the same MySQL transaction.
- Prevent duplicate batches if the user submits the action more than once, and do not let pending/deferred/rejected donations count as available stock.

## 8. Inventory management
- Show batch code, blood group, units available, collection date, expiry date, and status.
- Filter by blood group and status.
- Show low-stock and near-expiry warnings.
- Exclude expired, empty, quarantined, and discarded stock from available totals.
- Read inventory from `blood_inventory_batches` and `stock_movements`; never hard-code totals.

## 9. Hospital management
- Add, list, edit, search, and delete hospitals.
- Prevent deletion when existing requests reference a hospital and explain why.

## 10. Blood request management
- Create and list requests for hospitals with blood group, positive requested units, urgency (`ROUTINE`, `URGENT`, `EMERGENCY`), required-by date, and optional notes.
- Filter by hospital, blood group, urgency, and status.
- Allow authorized staff to approve or reject pending requests, using only the status values already defined in the supplied schema.

## 11. Issue stock and fulfil requests
This is a core DBMS feature:
1. Only approved requests can be fulfilled.
2. Find inventory batches for the exact requested blood group that are available and not expired.
3. Choose eligible stock in earliest-expiry-first order.
4. Verify enough units exist before changing stock.
5. Use a MySQL transaction to lock eligible rows, decrement batch quantities, insert `blood_issues` rows, insert matching `stock_movements` rows, and update the request status.
6. Roll back all changes if any step fails.
7. Never issue more than the outstanding request or allow negative stock.
8. Never issue expired, empty, quarantined, or discarded stock.

Checking an exact blood-group label is not a clinical compatibility decision. The application must not claim to determine transfusion compatibility.

## 12. Reports and required SQL concepts
Build a reports page using real MySQL queries:
- Available stock grouped by blood group.
- Donations grouped by screening status and month.
- Requests grouped by status and urgency.
- Expired and near-expiry inventory batches.
- Issued units and fulfilled requests.

Demonstrate `JOIN`, `COUNT`, `SUM`, `GROUP BY`, and at least one subquery. Accurate, readable tables are more important than complex charts.

## 13. UI requirements
- Responsive admin dashboard with a white/light background, dark navy text, and red accents.
- Sidebar or clear navigation, summary cards, searchable tables, status badges, consistent spacing, and accessible forms.
- Flash/success/error messages, empty states, confirmations for destructive actions, and useful validation errors.
- Use vanilla JavaScript for modest UI interactions.
- Every visible button/link must work. No mock-only data, fake buttons, or placeholder pages.

## 14. Database and code quality
Use the existing tables/view: `users`, `donors`, `hospitals`, `donations`, `blood_inventory_batches`, `blood_requests`, `blood_issues`, `stock_movements`, and `v_current_blood_stock`.
- Use `mysql2/promise` with a connection pool.
- Use parameterized queries everywhere; never concatenate user input into SQL.
- Validate input on the server; protect against CSRF; require authentication for protected pages.
- Keep credentials and secrets in `.env`; commit only `.env.example`.
- Do not reset or recreate the database when the server starts.
- Handle duplicate codes, missing records, foreign-key conflicts, and database errors with friendly messages.
- Each inventory change and its matching `stock_movements` record must occur in the same transaction.
- Add focused tests for password-hash verification and stock-issue logic if practical. Do not claim tests passed unless they were actually run.

## 15. README and final verification
The README must include:
1. How to import `blood_bank_management.sql` with MySQL Workbench.
2. How to configure `.env` (`DB_HOST`, `DB_PORT`, `DB_NAME=blood_bank_demo`, `DB_USER`, `DB_PASSWORD`, `SESSION_SECRET`, and `PORT`).
3. Install dependencies with `npm install`.
4. Start the app with `npm start` and open the local URL shown in the terminal (normally `http://localhost:3000`).
5. Demo login credentials and a warning to replace them for any real deployment.
6. Database table explanations, relationships, and a Mermaid ER diagram.
7. Viva explanations for CRUD, primary/foreign keys, JOINs, aggregate functions, subqueries, and transaction handling.

Import the supplied SQL dataset and test database connectivity, login, dashboard, donor CRUD, hospital CRUD, donation clearance, inventory updates, request approval, stock issue transaction, and reports where the environment allows. Fix errors found. If MySQL is unavailable, say which checks could not be run and provide exact local test commands.

## Definition of done
The finished project must connect to MySQL, support login, show live dashboard statistics, manage donors/hospitals/donations, create inventory only for cleared donations, display expiry warnings, create and approve requests, fulfil approved requests with safe transactional stock updates, and show live reports. Keep it simple enough to explain in a college DBMS viva. **Use JavaScript/Node.js throughout the backend; do not generate Python files or Flask code.**
