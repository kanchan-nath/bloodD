-- BLOOD BANK MANAGEMENT SYSTEM - SYNTHETIC COURSEWORK DATABASE
-- MySQL 8.0+. All names, contact details, requests, and transactions are fictional.
-- This script recreates only the `blood_bank_demo` database tables and demo rows.
CREATE DATABASE IF NOT EXISTS blood_bank_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE blood_bank_demo;
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS v_current_blood_stock;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS blood_issues;
DROP TABLE IF EXISTS blood_requests;
DROP TABLE IF EXISTS blood_inventory_batches;
DROP TABLE IF EXISTS donations;
DROP TABLE IF EXISTS hospitals;
DROP TABLE IF EXISTS donors;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','STAFF') NOT NULL DEFAULT 'STAFF',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE donors (
  donor_id INT AUTO_INCREMENT PRIMARY KEY,
  donor_code VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender ENUM('Female','Male','Other','Prefer not to say') NOT NULL,
  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(160) NULL,
  city VARCHAR(80) NOT NULL,
  last_donation_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_donors_name (full_name),
  INDEX idx_donors_blood_group (blood_group)
) ENGINE=InnoDB;

CREATE TABLE hospitals (
  hospital_id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_code VARCHAR(20) NOT NULL UNIQUE,
  hospital_name VARCHAR(160) NOT NULL,
  contact_person VARCHAR(120) NOT NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(160) NULL,
  city VARCHAR(80) NOT NULL,
  address VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hospitals_name (hospital_name)
) ENGINE=InnoDB;

CREATE TABLE donations (
  donation_id INT AUTO_INCREMENT PRIMARY KEY,
  donation_code VARCHAR(24) NOT NULL UNIQUE,
  donor_id INT NOT NULL,
  donation_date DATE NOT NULL,
  units_collected INT NOT NULL DEFAULT 1,
  screening_status ENUM('PENDING','CLEARED','DEFERRED','REJECTED') NOT NULL DEFAULT 'PENDING',
  screened_by INT NULL,
  created_by INT NOT NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_donations_donor FOREIGN KEY (donor_id) REFERENCES donors(donor_id),
  CONSTRAINT fk_donations_screened_by FOREIGN KEY (screened_by) REFERENCES users(user_id),
  CONSTRAINT fk_donations_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT chk_donation_units CHECK (units_collected > 0),
  INDEX idx_donations_date_status (donation_date, screening_status)
) ENGINE=InnoDB;

CREATE TABLE blood_inventory_batches (
  batch_id INT AUTO_INCREMENT PRIMARY KEY,
  batch_code VARCHAR(24) NOT NULL UNIQUE,
  donation_id INT NOT NULL UNIQUE,
  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  component_type ENUM('WHOLE_BLOOD') NOT NULL DEFAULT 'WHOLE_BLOOD',
  units_total INT NOT NULL DEFAULT 1,
  units_available INT NOT NULL DEFAULT 1,
  collection_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status ENUM('AVAILABLE','EXPIRED','EMPTY','QUARANTINED','DISCARDED') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_batch_donation FOREIGN KEY (donation_id) REFERENCES donations(donation_id),
  CONSTRAINT chk_batch_units CHECK (units_total >= 0 AND units_available >= 0 AND units_available <= units_total),
  INDEX idx_batch_stock (blood_group, status, expiry_date)
) ENGINE=InnoDB;

CREATE TABLE blood_requests (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(24) NOT NULL UNIQUE,
  hospital_id INT NOT NULL,
  blood_group ENUM('A+','A-','B+','B-','AB+','AB-','O+','O-') NOT NULL,
  component_type ENUM('WHOLE_BLOOD') NOT NULL DEFAULT 'WHOLE_BLOOD',
  units_requested INT NOT NULL,
  urgency ENUM('ROUTINE','URGENT','EMERGENCY') NOT NULL DEFAULT 'ROUTINE',
  status ENUM('PENDING','APPROVED','FULFILLED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  required_by DATE NULL,
  patient_reference VARCHAR(40) NULL,
  notes VARCHAR(500) NULL,
  handled_by INT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_requests_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id),
  CONSTRAINT fk_requests_handled_by FOREIGN KEY (handled_by) REFERENCES users(user_id),
  CONSTRAINT fk_requests_created_by FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT chk_request_units CHECK (units_requested > 0),
  INDEX idx_requests_status_urgency (status, urgency),
  INDEX idx_requests_blood_group (blood_group)
) ENGINE=InnoDB;

CREATE TABLE blood_issues (
  issue_id INT AUTO_INCREMENT PRIMARY KEY,
  issue_code VARCHAR(24) NOT NULL UNIQUE,
  request_id INT NOT NULL,
  batch_id INT NOT NULL,
  units_issued INT NOT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issued_by INT NOT NULL,
  notes VARCHAR(500) NULL,
  CONSTRAINT fk_issues_request FOREIGN KEY (request_id) REFERENCES blood_requests(request_id),
  CONSTRAINT fk_issues_batch FOREIGN KEY (batch_id) REFERENCES blood_inventory_batches(batch_id),
  CONSTRAINT fk_issues_user FOREIGN KEY (issued_by) REFERENCES users(user_id),
  CONSTRAINT chk_issued_units CHECK (units_issued > 0),
  INDEX idx_issues_issued_at (issued_at)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  movement_id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT NOT NULL,
  movement_type ENUM('DONATION_IN','ISSUE_OUT','EXPIRY_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT') NOT NULL,
  quantity INT NOT NULL,
  reference_code VARCHAR(40) NULL,
  notes VARCHAR(500) NULL,
  created_by INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movements_batch FOREIGN KEY (batch_id) REFERENCES blood_inventory_batches(batch_id),
  CONSTRAINT fk_movements_user FOREIGN KEY (created_by) REFERENCES users(user_id),
  CONSTRAINT chk_movement_quantity CHECK (quantity > 0),
  INDEX idx_movements_batch_date (batch_id, created_at)
) ENGINE=InnoDB;

CREATE VIEW v_current_blood_stock AS
SELECT blood_group, SUM(units_available) AS available_units
FROM blood_inventory_batches
WHERE status = 'AVAILABLE' AND expiry_date >= CURDATE()
GROUP BY blood_group;



INSERT INTO `users` (`user_id`, `full_name`, `username`, `password_hash`, `role`, `is_active`, `created_at`) VALUES
  (1, 'Demo Administrator', 'admin', 'pbkdf2:sha256:600000$6d95954d2d6ebc71$f6fba0b53e1f0067b19d4df709cd5d44b05425555231971999b9e8fc22cd3867', 'ADMIN', 1, '2026-10-01 09:00:00'),
  (2, 'Demo Staff Member', 'staff', 'pbkdf2:sha256:600000$9d589b11dfc01f56$8f3f592f4f63705df96f29b7e8f4f6d5812a5a1c998758f9b5c4f1360e189349', 'STAFF', 1, '2026-10-01 09:10:00');


INSERT INTO `donors` (`donor_id`, `donor_code`, `full_name`, `date_of_birth`, `gender`, `blood_group`, `phone`, `email`, `city`, `last_donation_date`, `created_at`) VALUES
  (1, 'DNR-0001', 'Aarav Sen', '1982-01-01', 'Female', 'A+', '0000000001', 'donor001@example.test', 'Durgapur', '2026-09-17', '2026-09-01 10:00:00'),
  (2, 'DNR-0002', 'Ananya Dutta', '1983-02-02', 'Male', 'A+', '0000000002', 'donor002@example.test', 'Asansol', '2026-09-24', '2026-09-01 10:00:00'),
  (3, 'DNR-0003', 'Rohan Saha', '1984-03-03', 'Male', 'A+', '0000000003', 'donor003@example.test', 'Kolkata', '2026-10-20', '2026-09-01 10:00:00'),
  (4, 'DNR-0004', 'Priya Banerjee', '1985-04-04', 'Female', 'A+', '0000000004', 'donor004@example.test', 'Bardhaman', NULL, '2026-09-01 10:00:00'),
  (5, 'DNR-0005', 'Ishaan Mitra', '1986-05-05', 'Female', 'A-', '0000000005', 'donor005@example.test', 'Siliguri', '2026-09-17', '2026-09-01 10:00:00'),
  (6, 'DNR-0006', 'Kavya Sen', '1987-06-06', 'Male', 'A-', '0000000006', 'donor006@example.test', 'Howrah', '2026-09-24', '2026-09-01 10:00:00'),
  (7, 'DNR-0007', 'Arjun Dutta', '1988-07-07', 'Male', 'A-', '0000000007', 'donor007@example.test', 'Kharagpur', '2026-10-20', '2026-09-01 10:00:00'),
  (8, 'DNR-0008', 'Meera Saha', '1989-08-08', 'Female', 'A-', '0000000008', 'donor008@example.test', 'Bankura', NULL, '2026-09-01 10:00:00'),
  (9, 'DNR-0009', 'Aditya Chatterjee', '1990-09-09', 'Female', 'B+', '0000000009', 'donor009@example.test', 'Durgapur', '2026-09-17', '2026-09-01 10:00:00'),
  (10, 'DNR-0010', 'Ira Mitra', '1991-10-10', 'Male', 'B+', '0000000010', 'donor010@example.test', 'Asansol', '2026-09-24', '2026-09-01 10:00:00'),
  (11, 'DNR-0011', 'Rahul Sen', '1992-11-11', 'Male', 'B+', '0000000011', 'donor011@example.test', 'Kolkata', '2026-10-20', '2026-09-01 10:00:00'),
  (12, 'DNR-0012', 'Sneha Dutta', '1993-12-12', 'Female', 'B+', '0000000012', 'donor012@example.test', 'Bardhaman', NULL, '2026-09-01 10:00:00'),
  (13, 'DNR-0013', 'Dev Pal', '1994-01-13', 'Female', 'B-', '0000000013', 'donor013@example.test', 'Siliguri', '2026-09-17', '2026-09-01 10:00:00'),
  (14, 'DNR-0014', 'Nisha Chatterjee', '1995-02-14', 'Male', 'B-', '0000000014', 'donor014@example.test', 'Howrah', '2026-09-24', '2026-09-01 10:00:00'),
  (15, 'DNR-0015', 'Sayan Mitra', '1996-03-15', 'Male', 'B-', '0000000015', 'donor015@example.test', 'Kharagpur', '2026-10-20', '2026-09-01 10:00:00'),
  (16, 'DNR-0016', 'Riya Sen', '1997-04-16', 'Female', 'B-', '0000000016', 'donor016@example.test', 'Bankura', NULL, '2026-09-01 10:00:00'),
  (17, 'DNR-0017', 'Amit Ghosh', '1998-05-17', 'Female', 'AB+', '0000000017', 'donor017@example.test', 'Durgapur', '2026-09-17', '2026-09-01 10:00:00'),
  (18, 'DNR-0018', 'Tara Pal', '1999-06-18', 'Male', 'AB+', '0000000018', 'donor018@example.test', 'Asansol', '2026-09-24', '2026-09-01 10:00:00'),
  (19, 'DNR-0019', 'Kabir Chatterjee', '2000-07-19', 'Male', 'AB+', '0000000019', 'donor019@example.test', 'Kolkata', '2026-10-20', '2026-09-01 10:00:00'),
  (20, 'DNR-0020', 'Maya Mitra', '1982-08-20', 'Female', 'AB+', '0000000020', 'donor020@example.test', 'Bardhaman', NULL, '2026-09-01 10:00:00'),
  (21, 'DNR-0021', 'Neel Das', '1983-09-21', 'Female', 'AB-', '0000000021', 'donor021@example.test', 'Siliguri', '2026-09-17', '2026-09-01 10:00:00'),
  (22, 'DNR-0022', 'Diya Ghosh', '1984-10-22', 'Male', 'AB-', '0000000022', 'donor022@example.test', 'Howrah', '2026-09-24', '2026-09-01 10:00:00'),
  (23, 'DNR-0023', 'Kunal Pal', '1985-11-23', 'Male', 'AB-', '0000000023', 'donor023@example.test', 'Kharagpur', '2026-10-20', '2026-09-01 10:00:00'),
  (24, 'DNR-0024', 'Pooja Chatterjee', '1986-12-24', 'Female', 'AB-', '0000000024', 'donor024@example.test', 'Bankura', NULL, '2026-09-01 10:00:00'),
  (25, 'DNR-0025', 'Arnav Kundu', '1987-01-25', 'Female', 'O+', '0000000025', 'donor025@example.test', 'Durgapur', '2026-09-17', '2026-09-01 10:00:00'),
  (26, 'DNR-0026', 'Ishita Das', '1988-02-26', 'Male', 'O+', '0000000026', 'donor026@example.test', 'Asansol', '2026-09-24', '2026-09-01 10:00:00'),
  (27, 'DNR-0027', 'Soham Ghosh', '1989-03-01', 'Male', 'O+', '0000000027', 'donor027@example.test', 'Kolkata', '2026-10-20', '2026-09-01 10:00:00'),
  (28, 'DNR-0028', 'Aditi Pal', '1990-04-02', 'Female', 'O+', '0000000028', 'donor028@example.test', 'Bardhaman', NULL, '2026-09-01 10:00:00'),
  (29, 'DNR-0029', 'Vivek Mukherjee', '1991-05-03', 'Female', 'O-', '0000000029', 'donor029@example.test', 'Siliguri', '2026-09-17', '2026-09-01 10:00:00'),
  (30, 'DNR-0030', 'Tanvi Kundu', '1992-06-04', 'Male', 'O-', '0000000030', 'donor030@example.test', 'Howrah', '2026-09-24', '2026-09-01 10:00:00'),
  (31, 'DNR-0031', 'Anik Das', '1993-07-05', 'Male', 'O-', '0000000031', 'donor031@example.test', 'Kharagpur', '2026-10-20', '2026-09-01 10:00:00'),
  (32, 'DNR-0032', 'Mitali Ghosh', '1994-08-06', 'Female', 'O-', '0000000032', 'donor032@example.test', 'Bankura', NULL, '2026-09-01 10:00:00');


INSERT INTO `hospitals` (`hospital_id`, `hospital_code`, `hospital_name`, `contact_person`, `phone`, `email`, `city`, `address`) VALUES
  (1, 'HSP-001', 'Durgapur Community Hospital', 'Demo Contact A', '0000001001', 'contact1@example.test', 'Durgapur', 'Demo Road 1, Durgapur'),
  (2, 'HSP-002', 'City Care Medical Centre', 'Demo Contact B', '0000001002', 'contact2@example.test', 'Asansol', 'Demo Avenue 2, Asansol'),
  (3, 'HSP-003', 'Green Valley Hospital', 'Demo Contact C', '0000001003', 'contact3@example.test', 'Durgapur', 'Sample Street 3, Durgapur'),
  (4, 'HSP-004', 'Eastern Diagnostic and Care', 'Demo Contact D', '0000001004', 'contact4@example.test', 'Bardhaman', 'Demo Lane 4, Bardhaman'),
  (5, 'HSP-005', 'Unity General Hospital', 'Demo Contact E', '0000001005', 'contact5@example.test', 'Kolkata', 'Training Boulevard 5, Kolkata'),
  (6, 'HSP-006', 'Sunrise Medical Institute', 'Demo Contact F', '0000001006', 'contact6@example.test', 'Siliguri', 'Sample Park 6, Siliguri');


INSERT INTO `donations` (`donation_id`, `donation_code`, `donor_id`, `donation_date`, `units_collected`, `screening_status`, `screened_by`, `created_by`, `notes`, `created_at`) VALUES
  (1, 'DON-2026-0001', 1, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (2, 'DON-2026-0002', 2, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (3, 'DON-2026-0003', 3, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (4, 'DON-2026-0004', 4, '2026-10-26', 1, 'PENDING', NULL, 1, 'Demo record: screening is pending.', '2026-10-26 11:00:00'),
  (5, 'DON-2026-0005', 5, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (6, 'DON-2026-0006', 6, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (7, 'DON-2026-0007', 7, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (8, 'DON-2026-0008', 8, '2026-10-26', 1, 'DEFERRED', 1, 1, 'Demo record: donor deferred in this sample dataset.', '2026-10-26 11:00:00'),
  (9, 'DON-2026-0009', 9, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (10, 'DON-2026-0010', 10, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (11, 'DON-2026-0011', 11, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (12, 'DON-2026-0012', 12, '2026-10-26', 1, 'REJECTED', 1, 1, 'Demo record: donation rejected in this sample dataset.', '2026-10-26 11:00:00'),
  (13, 'DON-2026-0013', 13, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (14, 'DON-2026-0014', 14, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (15, 'DON-2026-0015', 15, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (16, 'DON-2026-0016', 16, '2026-10-26', 1, 'PENDING', NULL, 1, 'Demo record: screening is pending.', '2026-10-26 11:00:00'),
  (17, 'DON-2026-0017', 17, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (18, 'DON-2026-0018', 18, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (19, 'DON-2026-0019', 19, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (20, 'DON-2026-0020', 20, '2026-10-26', 1, 'PENDING', NULL, 1, 'Demo record: screening is pending.', '2026-10-26 11:00:00'),
  (21, 'DON-2026-0021', 21, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (22, 'DON-2026-0022', 22, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (23, 'DON-2026-0023', 23, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (24, 'DON-2026-0024', 24, '2026-10-26', 1, 'DEFERRED', 1, 1, 'Demo record: donor deferred in this sample dataset.', '2026-10-26 11:00:00'),
  (25, 'DON-2026-0025', 25, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (26, 'DON-2026-0026', 26, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (27, 'DON-2026-0027', 27, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (28, 'DON-2026-0028', 28, '2026-10-26', 1, 'REJECTED', 1, 1, 'Demo record: donation rejected in this sample dataset.', '2026-10-26 11:00:00'),
  (29, 'DON-2026-0029', 29, '2026-09-17', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-17 11:00:00'),
  (30, 'DON-2026-0030', 30, '2026-09-24', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-09-24 11:00:00'),
  (31, 'DON-2026-0031', 31, '2026-10-20', 1, 'CLEARED', 1, 1, 'Demo record: screening marked cleared for UI testing.', '2026-10-20 11:00:00'),
  (32, 'DON-2026-0032', 32, '2026-10-26', 1, 'PENDING', NULL, 1, 'Demo record: screening is pending.', '2026-10-26 11:00:00');


INSERT INTO `blood_inventory_batches` (`batch_id`, `batch_code`, `donation_id`, `blood_group`, `component_type`, `units_total`, `units_available`, `collection_date`, `expiry_date`, `status`, `created_at`) VALUES
  (1, 'BB-0001', 1, 'A+', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (2, 'BB-0002', 2, 'A+', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (3, 'BB-0003', 3, 'A+', 'WHOLE_BLOOD', 1, 0, '2026-10-20', '2026-11-24', 'EMPTY', '2026-10-20 12:00:00'),
  (4, 'BB-0005', 5, 'A-', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (5, 'BB-0006', 6, 'A-', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (6, 'BB-0007', 7, 'A-', 'WHOLE_BLOOD', 1, 1, '2026-10-20', '2026-11-24', 'AVAILABLE', '2026-10-20 12:00:00'),
  (7, 'BB-0009', 9, 'B+', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (8, 'BB-0010', 10, 'B+', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (9, 'BB-0011', 11, 'B+', 'WHOLE_BLOOD', 1, 1, '2026-10-20', '2026-11-24', 'AVAILABLE', '2026-10-20 12:00:00'),
  (10, 'BB-0013', 13, 'B-', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (11, 'BB-0014', 14, 'B-', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (12, 'BB-0015', 15, 'B-', 'WHOLE_BLOOD', 1, 0, '2026-10-20', '2026-11-24', 'EMPTY', '2026-10-20 12:00:00'),
  (13, 'BB-0017', 17, 'AB+', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (14, 'BB-0018', 18, 'AB+', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (15, 'BB-0019', 19, 'AB+', 'WHOLE_BLOOD', 1, 0, '2026-10-20', '2026-11-24', 'EMPTY', '2026-10-20 12:00:00'),
  (16, 'BB-0021', 21, 'AB-', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (17, 'BB-0022', 22, 'AB-', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (18, 'BB-0023', 23, 'AB-', 'WHOLE_BLOOD', 1, 1, '2026-10-20', '2026-11-24', 'AVAILABLE', '2026-10-20 12:00:00'),
  (19, 'BB-0025', 25, 'O+', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (20, 'BB-0026', 26, 'O+', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (21, 'BB-0027', 27, 'O+', 'WHOLE_BLOOD', 1, 0, '2026-10-20', '2026-11-24', 'EMPTY', '2026-10-20 12:00:00'),
  (22, 'BB-0029', 29, 'O-', 'WHOLE_BLOOD', 1, 0, '2026-09-17', '2026-10-22', 'EXPIRED', '2026-09-17 12:00:00'),
  (23, 'BB-0030', 30, 'O-', 'WHOLE_BLOOD', 1, 1, '2026-09-24', '2026-10-29', 'AVAILABLE', '2026-09-24 12:00:00'),
  (24, 'BB-0031', 31, 'O-', 'WHOLE_BLOOD', 1, 0, '2026-10-20', '2026-11-24', 'EMPTY', '2026-10-20 12:00:00');


INSERT INTO `blood_requests` (`request_id`, `request_code`, `hospital_id`, `blood_group`, `component_type`, `units_requested`, `urgency`, `status`, `requested_at`, `required_by`, `patient_reference`, `notes`, `handled_by`, `created_by`) VALUES
  (1, 'REQ-2026-0001', 1, 'A+', 'WHOLE_BLOOD', 2, 'URGENT', 'PENDING', '2026-10-25 09:30:00', '2026-10-28', 'PAT-DEMO-0001', 'Need recorded for dashboard sample.', NULL, 1),
  (2, 'REQ-2026-0002', 2, 'O-', 'WHOLE_BLOOD', 1, 'EMERGENCY', 'FULFILLED', '2026-10-24 09:30:00', '2026-10-25', 'PAT-DEMO-0002', 'Demo request fulfilled in seed data.', 1, 1),
  (3, 'REQ-2026-0003', 3, 'B+', 'WHOLE_BLOOD', 2, 'ROUTINE', 'APPROVED', '2026-10-23 09:30:00', '2026-10-26', 'PAT-DEMO-0003', 'Approved; awaiting issue in this demo.', 1, 1),
  (4, 'REQ-2026-0004', 4, 'AB+', 'WHOLE_BLOOD', 1, 'URGENT', 'FULFILLED', '2026-10-22 09:30:00', '2026-10-25', 'PAT-DEMO-0004', 'Demo request fulfilled in seed data.', 1, 1),
  (5, 'REQ-2026-0005', 5, 'O+', 'WHOLE_BLOOD', 1, 'ROUTINE', 'FULFILLED', '2026-10-21 09:30:00', '2026-10-24', 'PAT-DEMO-0005', 'Demo request fulfilled in seed data.', 1, 1),
  (6, 'REQ-2026-0006', 1, 'A-', 'WHOLE_BLOOD', 1, 'ROUTINE', 'REJECTED', '2026-10-20 09:30:00', '2026-10-23', 'PAT-DEMO-0006', 'Rejected for workflow demonstration.', 1, 1),
  (7, 'REQ-2026-0007', 2, 'B-', 'WHOLE_BLOOD', 1, 'URGENT', 'FULFILLED', '2026-10-19 09:30:00', '2026-10-22', 'PAT-DEMO-0007', 'Demo request fulfilled in seed data.', 1, 1),
  (8, 'REQ-2026-0008', 4, 'A+', 'WHOLE_BLOOD', 1, 'ROUTINE', 'FULFILLED', '2026-10-18 09:30:00', '2026-10-21', 'PAT-DEMO-0008', 'Demo request fulfilled in seed data.', 1, 1),
  (9, 'REQ-2026-0009', 3, 'AB-', 'WHOLE_BLOOD', 2, 'URGENT', 'PENDING', '2026-10-17 09:30:00', '2026-10-20', 'PAT-DEMO-0009', 'Pending review.', NULL, 1),
  (10, 'REQ-2026-0010', 6, 'O+', 'WHOLE_BLOOD', 2, 'EMERGENCY', 'APPROVED', '2026-10-16 09:30:00', '2026-10-17', 'PAT-DEMO-0010', 'Approved; awaiting issue in this demo.', 1, 1),
  (11, 'REQ-2026-0011', 5, 'O+', 'WHOLE_BLOOD', 1, 'ROUTINE', 'CANCELLED', '2026-10-15 09:30:00', '2026-10-18', 'PAT-DEMO-0011', 'Cancelled sample request.', NULL, 1),
  (12, 'REQ-2026-0012', 1, 'B+', 'WHOLE_BLOOD', 1, 'ROUTINE', 'PENDING', '2026-10-14 09:30:00', '2026-10-17', 'PAT-DEMO-0012', 'Pending review.', NULL, 1);


INSERT INTO `blood_issues` (`issue_id`, `issue_code`, `request_id`, `batch_id`, `units_issued`, `issued_at`, `issued_by`, `notes`) VALUES
  (1, 'ISS-2026-0001', 2, 24, 1, '2026-10-24 14:00:00', 1, 'Synthetic issue transaction for coursework demonstration.'),
  (2, 'ISS-2026-0002', 4, 15, 1, '2026-10-22 14:00:00', 1, 'Synthetic issue transaction for coursework demonstration.'),
  (3, 'ISS-2026-0003', 5, 21, 1, '2026-10-21 14:00:00', 1, 'Synthetic issue transaction for coursework demonstration.'),
  (4, 'ISS-2026-0004', 7, 12, 1, '2026-10-19 14:00:00', 1, 'Synthetic issue transaction for coursework demonstration.'),
  (5, 'ISS-2026-0005', 8, 3, 1, '2026-10-18 14:00:00', 1, 'Synthetic issue transaction for coursework demonstration.');


INSERT INTO `stock_movements` (`movement_id`, `batch_id`, `movement_type`, `quantity`, `reference_code`, `notes`, `created_by`, `created_at`) VALUES
  (1, 1, 'DONATION_IN', 1, 'DON-2026-0001', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (2, 1, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0001', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (3, 2, 'DONATION_IN', 1, 'DON-2026-0002', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (4, 3, 'DONATION_IN', 1, 'DON-2026-0003', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (5, 4, 'DONATION_IN', 1, 'DON-2026-0005', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (6, 4, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0005', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (7, 5, 'DONATION_IN', 1, 'DON-2026-0006', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (8, 6, 'DONATION_IN', 1, 'DON-2026-0007', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (9, 7, 'DONATION_IN', 1, 'DON-2026-0009', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (10, 7, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0009', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (11, 8, 'DONATION_IN', 1, 'DON-2026-0010', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (12, 9, 'DONATION_IN', 1, 'DON-2026-0011', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (13, 10, 'DONATION_IN', 1, 'DON-2026-0013', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (14, 10, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0013', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (15, 11, 'DONATION_IN', 1, 'DON-2026-0014', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (16, 12, 'DONATION_IN', 1, 'DON-2026-0015', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (17, 13, 'DONATION_IN', 1, 'DON-2026-0017', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (18, 13, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0017', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (19, 14, 'DONATION_IN', 1, 'DON-2026-0018', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (20, 15, 'DONATION_IN', 1, 'DON-2026-0019', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (21, 16, 'DONATION_IN', 1, 'DON-2026-0021', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (22, 16, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0021', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (23, 17, 'DONATION_IN', 1, 'DON-2026-0022', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (24, 18, 'DONATION_IN', 1, 'DON-2026-0023', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (25, 19, 'DONATION_IN', 1, 'DON-2026-0025', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (26, 19, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0025', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (27, 20, 'DONATION_IN', 1, 'DON-2026-0026', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (28, 21, 'DONATION_IN', 1, 'DON-2026-0027', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (29, 22, 'DONATION_IN', 1, 'DON-2026-0029', 'Initial stock from synthetic cleared donation.', 1, '2026-09-17 12:05:00'),
  (30, 22, 'EXPIRY_OUT', 1, 'EXP-DON-2026-0029', 'Expired sample unit; excluded from available stock.', 1, '2026-10-22 00:01:00'),
  (31, 23, 'DONATION_IN', 1, 'DON-2026-0030', 'Initial stock from synthetic cleared donation.', 1, '2026-09-24 12:05:00'),
  (32, 24, 'DONATION_IN', 1, 'DON-2026-0031', 'Initial stock from synthetic cleared donation.', 1, '2026-10-20 12:05:00'),
  (33, 24, 'ISSUE_OUT', 1, 'ISS-2026-0001', 'Stock issued against fulfilled demo request.', 1, '2026-10-24 14:05:00'),
  (34, 15, 'ISSUE_OUT', 1, 'ISS-2026-0002', 'Stock issued against fulfilled demo request.', 1, '2026-10-22 14:05:00'),
  (35, 21, 'ISSUE_OUT', 1, 'ISS-2026-0003', 'Stock issued against fulfilled demo request.', 1, '2026-10-21 14:05:00'),
  (36, 12, 'ISSUE_OUT', 1, 'ISS-2026-0004', 'Stock issued against fulfilled demo request.', 1, '2026-10-19 14:05:00'),
  (37, 3, 'ISSUE_OUT', 1, 'ISS-2026-0005', 'Stock issued against fulfilled demo request.', 1, '2026-10-18 14:05:00');
