const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_BATCH_STATUSES = ['AVAILABLE', 'EXPIRED', 'EMPTY', 'QUARANTINED', 'DISCARDED'];

/**
 * GET /inventory - Stock management and batch inspection
 */
router.get('/', requireAuth, async (req, res) => {
  const { blood_group, status, q } = req.query;

  // Background check: mark any past-expiry AVAILABLE batches as EXPIRED
  try {
    await pool.query(`
      UPDATE blood_inventory_batches 
      SET status = 'EXPIRED', units_available = 0 
      WHERE status = 'AVAILABLE' AND expiry_date < CURDATE()
    `);
  } catch (err) {
    console.warn('[Inventory Check Notice]', err.message);
  }

  let sql = `
    SELECT b.*, 
           DATEDIFF(b.expiry_date, CURDATE()) AS days_left,
           d.donation_code, d.donation_date,
           dnr.full_name AS donor_name, dnr.donor_code,
           (SELECT COUNT(*) FROM stock_movements WHERE batch_id = b.batch_id) AS movement_count
    FROM blood_inventory_batches b
    JOIN donations d ON b.donation_id = d.donation_id
    JOIN donors dnr ON d.donor_id = dnr.donor_id
    WHERE 1=1
  `;
  const params = [];

  if (blood_group && VALID_BLOOD_GROUPS.includes(blood_group)) {
    sql += ` AND b.blood_group = ?`;
    params.push(blood_group);
  }

  if (status && VALID_BATCH_STATUSES.includes(status)) {
    sql += ` AND b.status = ?`;
    params.push(status);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    sql += ` AND (b.batch_code LIKE ? OR d.donation_code LIKE ? OR dnr.full_name LIKE ? OR dnr.donor_code LIKE ?)`;
    params.push(term, term, term, term);
  }

  sql += ` ORDER BY b.status = 'AVAILABLE' DESC, b.expiry_date ASC, b.batch_id DESC`;

  try {
    const [batches] = await pool.query(sql, params);

    // Summary calculations from database view v_current_blood_stock
    const [viewRows] = await pool.query(
      'SELECT blood_group, available_units FROM v_current_blood_stock ORDER BY blood_group'
    );

    const stockSummary = {};
    VALID_BLOOD_GROUPS.forEach(bg => { stockSummary[bg] = 0; });
    let totalAvailableUnits = 0;
    viewRows.forEach(row => {
      const units = parseInt(row.available_units, 10) || 0;
      stockSummary[row.blood_group] = units;
      totalAvailableUnits += units;
    });

    // Count near expiry batches
    const [[{ nearExpiryCount }]] = await pool.query(`
      SELECT COUNT(*) AS nearExpiryCount 
      FROM blood_inventory_batches 
      WHERE status = 'AVAILABLE' 
        AND units_available > 0 
        AND expiry_date >= CURDATE() 
        AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
    `);

    res.render('inventory/index', {
      title: 'Blood Stock & Batch Inventory',
      batches,
      selectedBloodGroup: blood_group || '',
      selectedStatus: status || '',
      q: q || '',
      validBloodGroups: VALID_BLOOD_GROUPS,
      validBatchStatuses: VALID_BATCH_STATUSES,
      stockSummary,
      totalAvailableUnits,
      nearExpiryCount
    });
  } catch (err) {
    console.error('[Inventory List Error]', err);
    req.flash('error', 'Error loading inventory: ' + err.message);
    res.redirect('/dashboard');
  }
});

/**
 * GET /inventory/batch/:id - View batch audit trail and stock movements
 */
router.get('/batch/:id', requireAuth, async (req, res) => {
  const batchId = parseInt(req.params.id, 10);
  if (isNaN(batchId)) return res.redirect('/inventory');

  try {
    const [batches] = await pool.query(
      `SELECT b.*, 
              DATEDIFF(b.expiry_date, CURDATE()) AS days_left,
              d.donation_code, d.donation_date, d.screening_status,
              dnr.full_name AS donor_name, dnr.donor_code, dnr.city AS donor_city
       FROM blood_inventory_batches b
       JOIN donations d ON b.donation_id = d.donation_id
       JOIN donors dnr ON d.donor_id = dnr.donor_id
       WHERE b.batch_id = ?`,
      [batchId]
    );

    if (batches.length === 0) {
      req.flash('error', 'Batch record not found.');
      return res.redirect('/inventory');
    }

    const batch = batches[0];

    // Fetch full audit movements for this batch
    const [movements] = await pool.query(
      `SELECT sm.*, u.full_name AS logged_by_name
       FROM stock_movements sm
       JOIN users u ON sm.created_by = u.user_id
       WHERE sm.batch_id = ?
       ORDER BY sm.created_at ASC, sm.movement_id ASC`,
      [batchId]
    );

    res.render('inventory/batch_detail', {
      title: `Batch Audit: ${batch.batch_code}`,
      batch,
      movements
    });
  } catch (err) {
    console.error('[Batch Detail Error]', err);
    req.flash('error', 'Error retrieving batch details: ' + err.message);
    res.redirect('/inventory');
  }
});

module.exports = router;
