# 🩸 Blood Bank Management System (DBMS Coursework Project)

A complete, production-structured college Database Management System (DBMS) web application built using **Node.js 20+, Express, MySQL 8, HTML5, CSS3, and Vanilla JavaScript**.

> **⚠️ Academic Demonstration Notice:**
> All donor names, contact numbers, hospital requests, donation logs, and inventory batches in this repository are synthetic. This software is designed strictly for educational coursework and DBMS viva demonstrations. It does not provide medical guidance, clinical compatibility advice, or automated transfusion clearance.

---

## 📌 Project Overview & Architecture

- **Backend:** Node.js 20+ with Express.js
- **Database Engine:** MySQL 8.0+ via `mysql2/promise` with connection pooling
- **Templating Engine:** EJS (Server-rendered HTML views)
- **Security & Usability:**
  - Password Hashing: Node's native `crypto.pbkdf2Sync` (Werkzeug-compatible `pbkdf2:sha256:600000$salt$hex_digest` format with timing-safe comparison)
  - Sessions: `express-session` with MySQL store (`express-mysql-session`)
  - CSRF Protection: Session-bound cryptographic tokens on all mutating POST requests
  - Brute-Force Rate Limiting: `express-rate-limit` on login endpoint
  - HTTP Security Headers: `helmet`
- **Frontend:** Pure semantic HTML5, custom responsive CSS (light theme with navy text and crimson accents), and lightweight vanilla JavaScript for dynamic table filtering, modal confirmations, and form helpers.

---

## 🗄️ Database Tables & Schema Design

The system runs on the `blood_bank_demo` database and maintains strict referential integrity across 8 core relational tables and 1 analytical view:

| Table / View | Description | Key Relationships |
| :--- | :--- | :--- |
| `users` | System operators (Administrator & Staff) | Primary entity for auditing |
| `donors` | Registered voluntary donors | Parent to `donations` (1-to-Many) |
| `hospitals` | Partner healthcare facilities and clinics | Parent to `blood_requests` (1-to-Many) |
| `donations` | Physical whole blood collection sessions | FK to `donors`, `users`; 1-to-1 with `blood_inventory_batches` |
| `blood_inventory_batches` | Tested and cleared units in storage | FK to `donations`; Child to `blood_issues`, `stock_movements` |
| `blood_requests` | Clinical blood requisitions submitted by hospitals | FK to `hospitals`, `users`; Parent to `blood_issues` |
| `blood_issues` | Dispatched blood units fulfilling hospital requests | FK to `blood_requests`, `blood_inventory_batches`, `users` |
| `stock_movements` | Immutable audit ledger of all inventory events | FK to `blood_inventory_batches`, `users` |
| `v_current_blood_stock` | View aggregating active available units by blood group | Filtered for `AVAILABLE` status and unexpired dates |

---

## 📊 Database Relationships (Mermaid ER Diagram)

```mermaid
erDiagram
    USERS ||--o{ DONATIONS : "records / screens"
    USERS ||--o{ BLOOD_REQUESTS : "creates / handles"
    USERS ||--o{ BLOOD_ISSUES : "dispatches"
    USERS ||--o{ STOCK_MOVEMENTS : "audits"
    DONORS ||--o{ DONATIONS : "provides"
    DONATIONS ||--o| BLOOD_INVENTORY_BATCHES : "generates when CLEARED"
    HOSPITALS ||--o{ BLOOD_REQUESTS : "submits"
    BLOOD_REQUESTS ||--o{ BLOOD_ISSUES : "fulfilled_by"
    BLOOD_INVENTORY_BATCHES ||--o{ BLOOD_ISSUES : "supplies"
    BLOOD_INVENTORY_BATCHES ||--o{ STOCK_MOVEMENTS : "tracks changes"

    USERS {
        int user_id PK
        string username UK
        string password_hash
        enum role "ADMIN, STAFF"
        boolean is_active
    }

    DONORS {
        int donor_id PK
        string donor_code UK
        string full_name
        date date_of_birth
        enum blood_group
        string city
        string phone
    }

    HOSPITALS {
        int hospital_id PK
        string hospital_code UK
        string hospital_name
        string contact_person
        string city
    }

    DONATIONS {
        int donation_id PK
        string donation_code UK
        int donor_id FK
        date donation_date
        int units_collected
        enum screening_status "PENDING, CLEARED, DEFERRED, REJECTED"
        int screened_by FK
        int created_by FK
    }

    BLOOD_INVENTORY_BATCHES {
        int batch_id PK
        string batch_code UK
        int donation_id FK
        enum blood_group
        int units_total
        int units_available
        date collection_date
        date expiry_date
        enum status "AVAILABLE, EXPIRED, EMPTY, QUARANTINED, DISCARDED"
    }

    BLOOD_REQUESTS {
        int request_id PK
        string request_code UK
        int hospital_id FK
        enum blood_group
        int units_requested
        enum urgency "ROUTINE, URGENT, EMERGENCY"
        enum status "PENDING, APPROVED, FULFILLED, REJECTED, CANCELLED"
    }

    BLOOD_ISSUES {
        int issue_id PK
        string issue_code UK
        int request_id FK
        int batch_id FK
        int units_issued
        datetime issued_at
        int issued_by FK
    }

    STOCK_MOVEMENTS {
        int movement_id PK
        int batch_id FK
        enum movement_type "DONATION_IN, ISSUE_OUT, EXPIRY_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT"
        int quantity
        string reference_code
        int created_by FK
    }
```

---

## 🚀 Step-by-Step Setup & Running Guide

### 1. Import Database with MySQL Workbench
1. Open **MySQL Workbench** and connect to your local MySQL 8 server.
2. Go to **File → Open SQL Script...** and choose `blood_bank_management.sql`.
3. Click the ⚡ **Execute** button to run the script.
4. Refresh the **Schemas** pane on the left: the `blood_bank_demo` database will appear with all 8 tables, seed records, and the summary view.

*(Alternative via terminal CLI)*:
```bash
mysql -u root -p < blood_bank_management.sql
```

### 2. Configure Environment Variables (`.env`)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` to match your local configuration:
```env
PORT=3000
SESSION_SECRET=a-secure-random-secret-key-for-session-encryption
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=blood_bank_demo
DB_USER=root
DB_PASSWORD=your_mysql_root_password
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Automated Test Suites
Run the built-in Node test runner to verify crypto hashing, database pool, views, and FIFO ordering:
```bash
npm test
```

### 5. Launch the Application
```bash
npm start
```
The terminal will display:
```text
========================================================================
🩸 BLOOD BANK MANAGEMENT SYSTEM — COLLEGE DBMS PROJECT
------------------------------------------------------------------------
🚀 Server running at: http://localhost:3000
💾 Database: blood_bank_demo @ 127.0.0.1:3306
========================================================================
```
Open your browser and navigate to: **`http://localhost:3000`**

---

## 🔑 Demo Login Credentials

| Username | Password | Role | Permissions |
| :--- | :--- | :--- | :--- |
| `admin` | `Admin@123` | **Administrator** | Full CRUD, Donor & Hospital deletions, Approval & Fulfillment |
| `staff` | `Staff@123` | **Staff Member** | Donor/Donation entry, Screening, Requisition creation & fulfillment |

> ⚠️ **Security Warning:** These demo accounts and PBKDF2 hashes are supplied exclusively for local academic evaluation. Replace passwords and session secrets prior to deploying to any shared environment.

---

## 🎓 DBMS Viva & Practical Examination Explanations

Here are the key theoretical and practical DBMS concepts demonstrated in this project:

### 1. CRUD Operations (Create, Read, Update, Delete)
- **Create:** Registering a new donor (`INSERT INTO donors ...`) or hospital (`INSERT INTO hospitals ...`).
- **Read:** Displaying paginated and searchable tables filtered by blood group and keywords (`SELECT ... WHERE blood_group = ? AND full_name LIKE ?`).
- **Update:** Modifying donor contact details or updating request statuses (`UPDATE blood_requests SET status = 'APPROVED' WHERE request_id = ?`).
- **Delete with Safety:** Destructive actions are restricted to POST requests and protected with CSRF verification.

### 2. Primary Keys & Foreign Keys (Referential Integrity)
- **Primary Keys:** Every table features a surrogate integer primary key with `AUTO_INCREMENT` (`donor_id`, `hospital_id`, `donation_id`, etc.) and a unique business code (`donor_code`, `batch_code`).
- **Foreign Key Enforcement:** Foreign keys prevent orphaned records.
  - *Viva Example:* If an administrator attempts to delete Donor #1 (`Aarav Sen`), MySQL rejects the operation because `donations` records reference `donor_id = 1`. The web app catches this and explains the relational rule to the user.

### 3. Relational JOINs
- **Multi-Table INNER JOIN:**
  Combining requests, hospitals, and blood issues to calculate total blood units received by hospital:
  ```sql
  SELECT h.hospital_name, h.city, SUM(bi.units_issued) AS total_units_received
  FROM hospitals h
  JOIN blood_requests r ON h.hospital_id = r.hospital_id
  JOIN blood_issues bi ON r.request_id = bi.request_id
  GROUP BY h.hospital_id, h.hospital_name, h.city;
  ```
- **LEFT JOIN:**
  Retaining all donations even if a screening review has not yet been assigned (`LEFT JOIN users u_screened ON d.screened_by = u_screened.user_id`).

### 4. Aggregate Functions & GROUP BY
- `COUNT(*)`: Calculates donor totals and request volumes.
- `SUM(units_available)`: Aggregates real-time inventory levels.
- `DATE_FORMAT(donation_date, '%Y-%m')`: Groups continuous dates into monthly reporting bins.

### 5. Nested Subqueries
Used on the Reports page to identify inventory batches nearing expiration:
```sql
SELECT b.batch_code, b.blood_group, b.units_available, b.expiry_date
FROM blood_inventory_batches b
WHERE b.batch_id IN (
  SELECT batch_id 
  FROM blood_inventory_batches 
  WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
);
```

### 6. Atomic Transactions & ACID Properties
In the Stock Fulfillment workflow (`routes/requests.js` → `POST /requests/:id/issue`):
1. **Atomicity:** Decrementing inventory batches, inserting `blood_issues` records, inserting `stock_movements` (ISSUE_OUT) records, and marking `blood_requests` as `FULFILLED` are executed inside `conn.beginTransaction()`. If any step fails or stock is insufficient, `conn.rollback()` restores the exact previous state.
2. **Consistency:** Schema check constraints (`chk_batch_units`, `chk_issued_units`) ensure `units_available >= 0` at all times.
3. **Isolation:** Rows are locked using `FOR UPDATE` so concurrent requests for the same blood group cannot result in double-allocation or race conditions.
4. **Durability:** Once `conn.commit()` succeeds, the changes are permanently recorded in MySQL transaction logs.

### 7. FIFO (First-In, First-Out) Inventory Rotation
Blood products have fixed storage lifespans (35 days for whole blood). The system uses:
```sql
ORDER BY expiry_date ASC, batch_id ASC FOR UPDATE
```
This guarantees that units nearest to expiration are allocated first, minimizing waste.

---

## 📁 Repository Structure

```text
BloodD/
├── .env.example                # Template for environment configuration
├── .gitignore                  # Git exclusions (node_modules, .env, logs)
├── README.md                   # Complete viva and installation documentation
├── package.json                # Project dependencies and test scripts
├── server.js                   # Express application entry point & middleware setup
├── blood_bank_management.sql   # Complete MySQL 8 database schema and seed records
├── db/
│   └── pool.js                 # mysql2/promise connection pool configuration
├── middleware/
│   ├── auth.js                 # Authentication and role-based access control
│   └── csrf.js                 # Session-bound CSRF validation middleware
├── routes/
│   ├── auth.js                 # Login, session management, logout
│   ├── dashboard.js            # Analytical dashboard queries and metric cards
│   ├── donors.js               # Donor CRUD and donation history
│   ├── donations.js            # Collection intake & laboratory screening workflow
│   ├── hospitals.js            # Hospital partner CRUD operations
│   ├── inventory.js            # Storage batch inspection & expiry tracking
│   ├── requests.js             # Hospital requisitions & transactional stock issue
│   └── reports.js              # Comprehensive SQL analytics & viva reports
├── utils/
│   └── crypto.js               # Werkzeug-compatible PBKDF2 hash verification
├── views/
│   ├── dashboard.ejs           # Main operational dashboard
│   ├── login.ejs               # Sign-in portal with demo auto-fill
│   ├── reports.ejs             # SQL reports with collapsible syntax
│   ├── donors/                 # Donor listing, form, and profile views
│   ├── donations/              # Donation listing and collection intake form
│   ├── hospitals/              # Hospital directory and partner form
│   ├── inventory/              # Inventory batch table and audit trail view
│   ├── requests/               # Blood requests, detail, and fulfillment view
│   └── partials/               # Reusable headers, sidebar, alerts, and banners
├── public/
│   ├── css/style.css           # Clean custom stylesheet (Navy & Crimson theme)
│   └── js/main.js              # Dynamic search, dialogs, and helper scripts
├── dataset/                    # Synthetic CSV seed archives
└── tests/
    ├── crypto.test.js          # PBKDF2 verification & round-trip tests
    └── system.test.js          # DB connection, views, integrity, and FIFO tests
```
