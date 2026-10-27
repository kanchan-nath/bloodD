const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const ALL_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * GET /dashboard - Main metrics and overview
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    // 1. Total Donors count
    const [[{ total_donors }]] = await pool.query('SELECT COUNT(*) AS total_donors FROM donors');

    // 2. Donations awaiting screening
    const [[{ pending_donations }]] = await pool.query(
      "SELECT COUNT(*) AS pending_donations FROM donations WHERE screening_status = 'PENDING'"
    );

    // 3. Pending requests & Emergency requests
    const [[{ pending_requests }]] = await pool.query(
      "SELECT COUNT(*) AS pending_requests FROM blood_requests WHERE status = 'PENDING'"
    );

    const [[{ emergency_requests }]] = await pool.query(
      "SELECT COUNT(*) AS emergency_requests FROM blood_requests WHERE urgency = 'EMERGENCY' AND status IN ('PENDING', 'APPROVED')"
    );

    // 4. Batches expiring in next 14 days
    const [[{ expiring_soon_count }]] = await pool.query(
      `SELECT COUNT(*) AS expiring_soon_count 
       FROM blood_inventory_batches 
       WHERE status = 'AVAILABLE' 
         AND units_available > 0 
         AND expiry_date >= CURDATE() 
         AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)`
    );

    // 5. Total available units in inventory
    const [[{ total_available_units }]] = await pool.query(
      "SELECT COALESCE(SUM(units_available), 0) AS total_available_units FROM blood_inventory_batches WHERE status = 'AVAILABLE' AND expiry_date >= CURDATE()"
    );

    // 6. Stock grouped by Blood Group (from view v_current_blood_stock)
    const [stockRows] = await pool.query(
      'SELECT blood_group, available_units FROM v_current_blood_stock ORDER BY blood_group'
    );

    // Map into complete dictionary ensuring all 8 blood groups exist
    const stockMap = {};
    ALL_BLOOD_GROUPS.forEach(bg => { stockMap[bg] = 0; });
    stockRows.forEach(row => {
      stockMap[row.blood_group] = parseInt(row.available_units, 10) || 0;
    });

    // 7. Expiring soon batch items
    const [expiringBatches] = await pool.query(
      `SELECT batch_id, batch_code, blood_group, units_available, expiry_date, 
              DATEDIFF(expiry_date, CURDATE()) AS days_left
       FROM blood_inventory_batches
       WHERE status = 'AVAILABLE' 
         AND units_available > 0 
         AND expiry_date >= CURDATE() 
         AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
       ORDER BY expiry_date ASC
       LIMIT 5`
    );

    // 8. Recent donations (JOIN with donors)
    const [recentDonations] = await pool.query(
      `SELECT d.donation_id, d.donation_code, d.donation_date, d.units_collected, 
              d.screening_status, dnr.full_name AS donor_name, dnr.blood_group
       FROM donations d
       JOIN donors dnr ON d.donor_id = dnr.donor_id
       ORDER BY d.donation_date DESC, d.donation_id DESC
       LIMIT 6`
    );

    // 9. Recent requests (JOIN with hospitals)
    const [recentRequests] = await pool.query(
      `SELECT r.request_id, r.request_code, r.blood_group, r.units_requested, 
              r.urgency, r.status, r.requested_at, h.hospital_name
       FROM blood_requests r
       JOIN hospitals h ON r.hospital_id = h.hospital_id
       ORDER BY r.requested_at DESC, r.request_id DESC
       LIMIT 6`
    );

    res.render('dashboard', {
      title: 'Operations Dashboard',
      stats: {
        totalDonors: total_donors,
        pendingDonations: pending_donations,
        pendingRequests: pending_requests,
        emergencyRequests: emergency_requests,
        expiringSoon: expiring_soon_count,
        totalAvailableUnits: total_available_units
      },
      stockMap,
      expiringBatches,
      recentDonations,
      recentRequests
    });
  } catch (error) {
    console.error('[Dashboard Error]', error);
    req.flash('error', 'Unable to retrieve dashboard metrics: ' + error.message);
    res.render('dashboard', {
      title: 'Operations Dashboard',
      stats: {
        totalDonors: 0,
        pendingDonations: 0,
        pendingRequests: 0,
        emergencyRequests: 0,
        expiringSoon: 0,
        totalAvailableUnits: 0
      },
      stockMap: {},
      expiringBatches: [],
      recentDonations: [],
      recentRequests: []
    });
  }
});

module.exports = router;
