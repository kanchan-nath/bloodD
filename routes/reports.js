const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /reports - SQL Analytics and Viva Demonstration Queries
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    // 1. Available Stock by Blood Group (SUM, COUNT, GROUP BY)
    const sql1 = `
      SELECT b.blood_group, 
             COUNT(b.batch_id) AS total_batches,
             COALESCE(SUM(b.units_total), 0) AS total_units_collected,
             COALESCE(SUM(b.units_available), 0) AS available_units,
             ROUND(COALESCE(SUM(b.units_available), 0) * 100.0 / NULLIF(SUM(b.units_total), 0), 1) AS availability_pct
      FROM blood_inventory_batches b
      WHERE b.status = 'AVAILABLE' AND b.expiry_date >= CURDATE()
      GROUP BY b.blood_group
      ORDER BY b.blood_group ASC
    `;
    const [stockReport] = await pool.query(sql1);

    // 2. Donations by Month & Screening Status (DATE_FORMAT, COUNT, SUM, GROUP BY)
    const sql2 = `
      SELECT DATE_FORMAT(donation_date, '%Y-%m') AS donation_month,
             screening_status,
             COUNT(*) AS total_donations,
             SUM(units_collected) AS total_units
      FROM donations
      GROUP BY DATE_FORMAT(donation_date, '%Y-%m'), screening_status
      ORDER BY donation_month DESC, screening_status ASC
    `;
    const [donationsReport] = await pool.query(sql2);

    // 3. Requisitions by Urgency & Status (COUNT, SUM, GROUP BY)
    const sql3 = `
      SELECT urgency,
             status,
             COUNT(*) AS total_requests,
             SUM(units_requested) AS total_units_demanded
      FROM blood_requests
      GROUP BY urgency, status
      ORDER BY FIELD(urgency, 'EMERGENCY', 'URGENT', 'ROUTINE'), status ASC
    `;
    const [requestsReport] = await pool.query(sql3);

    // 4. Batches Expired or Expiring in 14 Days (Demonstrating Subquery with IN)
    const sql4 = `
      SELECT b.batch_code,
             b.blood_group,
             b.units_available,
             b.expiry_date,
             b.status,
             DATEDIFF(b.expiry_date, CURDATE()) AS days_left,
             d.donation_code,
             dnr.full_name AS donor_name
      FROM blood_inventory_batches b
      JOIN donations d ON b.donation_id = d.donation_id
      JOIN donors dnr ON d.donor_id = dnr.donor_id
      WHERE b.batch_id IN (
        SELECT batch_id 
        FROM blood_inventory_batches 
        WHERE expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
      )
      ORDER BY b.expiry_date ASC
    `;
    const [expiryReport] = await pool.query(sql4);

    // 5. Issued Units and Fulfilled Requests by Hospital (Multi-table JOIN, SUM, GROUP BY)
    const sql5 = `
      SELECT h.hospital_name,
             h.city,
             COUNT(DISTINCT r.request_id) AS fulfilled_request_count,
             COUNT(bi.issue_id) AS total_issue_transactions,
             COALESCE(SUM(bi.units_issued), 0) AS total_units_received
      FROM hospitals h
      JOIN blood_requests r ON h.hospital_id = r.hospital_id
      JOIN blood_issues bi ON r.request_id = bi.request_id
      GROUP BY h.hospital_id, h.hospital_name, h.city
      ORDER BY total_units_received DESC
    `;
    const [issuesReport] = await pool.query(sql5);

    res.render('reports', {
      title: 'DBMS SQL Reports & Query Analytics',
      stockReport,
      donationsReport,
      requestsReport,
      expiryReport,
      issuesReport
    });
  } catch (err) {
    console.error('[Reports Error]', err);
    req.flash('error', 'Error generating analytical reports: ' + err.message);
    res.redirect('/dashboard');
  }
});

module.exports = router;
