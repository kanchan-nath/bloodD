const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_STATUSES = ['PENDING', 'CLEARED', 'DEFERRED', 'REJECTED'];

/**
 * Generate next sequential donation code (e.g. DON-2026-0033)
 */
async function generateNextDonationCode() {
  const year = new Date().getFullYear();
  const prefix = `DON-${year}-`;
  const [rows] = await pool.query(
    'SELECT donation_code FROM donations WHERE donation_code LIKE ? ORDER BY donation_id DESC LIMIT 1',
    [`${prefix}%`]
  );
  if (rows.length === 0) return `${prefix}0001`;
  const match = rows[0].donation_code.match(/DON-\d+-(\d+)/);
  if (!match) return `${prefix}${Date.now().toString().slice(-4)}`;
  const nextNum = parseInt(match[1], 10) + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * Generate next sequential batch code (e.g. BB-0033)
 */
async function generateNextBatchCode(conn) {
  const [rows] = await conn.query(
    "SELECT batch_code FROM blood_inventory_batches WHERE batch_code LIKE 'BB-%' ORDER BY batch_id DESC LIMIT 1 FOR UPDATE"
  );
  if (rows.length === 0) return 'BB-0001';
  const match = rows[0].batch_code.match(/BB-(\d+)/);
  if (!match) return `BB-${Date.now().toString().slice(-4)}`;
  const nextNum = parseInt(match[1], 10) + 1;
  return `BB-${String(nextNum).padStart(4, '0')}`;
}

/**
 * GET /donations - List and filter donations
 */
router.get('/', requireAuth, async (req, res) => {
  const { status, q } = req.query;
  let sql = `
    SELECT d.*, 
           dnr.full_name AS donor_name, dnr.donor_code, dnr.blood_group, dnr.city AS donor_city,
           u_created.full_name AS created_by_name,
           u_screened.full_name AS screened_by_name,
           b.batch_code, b.status AS batch_status, b.units_available
    FROM donations d
    JOIN donors dnr ON d.donor_id = dnr.donor_id
    JOIN users u_created ON d.created_by = u_created.user_id
    LEFT JOIN users u_screened ON d.screened_by = u_screened.user_id
    LEFT JOIN blood_inventory_batches b ON d.donation_id = b.donation_id
    WHERE 1=1
  `;
  const params = [];

  if (status && VALID_STATUSES.includes(status)) {
    sql += ` AND d.screening_status = ?`;
    params.push(status);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    sql += ` AND (d.donation_code LIKE ? OR dnr.full_name LIKE ? OR dnr.donor_code LIKE ? OR b.batch_code LIKE ?)`;
    params.push(term, term, term, term);
  }

  sql += ` ORDER BY d.donation_date DESC, d.donation_id DESC`;

  try {
    const [donations] = await pool.query(sql, params);
    res.render('donations/index', {
      title: 'Donations & Screening Operations',
      donations,
      selectedStatus: status || '',
      q: q || '',
      validStatuses: VALID_STATUSES
    });
  } catch (err) {
    console.error('[Donations List Error]', err);
    req.flash('error', 'Error loading donations: ' + err.message);
    res.redirect('/dashboard');
  }
});

/**
 * GET /donations/new - Form to record a new donation
 */
router.get('/new', requireAuth, async (req, res) => {
  const preselectedDonorId = parseInt(req.query.donor_id, 10);

  try {
    const suggestedCode = await generateNextDonationCode();
    const today = new Date().toISOString().split('T')[0];

    // Fetch list of all donors for dropdown
    const [donors] = await pool.query(
      'SELECT donor_id, donor_code, full_name, blood_group, city FROM donors ORDER BY full_name ASC'
    );

    res.render('donations/form', {
      title: 'Record Blood Donation',
      suggestedCode,
      today,
      donors,
      preselectedDonorId: isNaN(preselectedDonorId) ? null : preselectedDonorId,
      validStatuses: VALID_STATUSES
    });
  } catch (err) {
    console.error('[Donation Form Error]', err);
    req.flash('error', 'Error preparing donation form.');
    res.redirect('/donations');
  }
});

/**
 * POST /donations - Record new donation
 */
router.post('/', requireAuth, async (req, res) => {
  const { donation_code, donor_id, donation_date, units_collected, screening_status, notes } = req.body;
  const currentUserId = req.session.user.user_id;

  const parsedDonorId = parseInt(donor_id, 10);
  const parsedUnits = parseInt(units_collected, 10) || 1;

  if (!donation_code || isNaN(parsedDonorId) || !donation_date) {
    req.flash('error', 'Donation code, donor, and collection date are required.');
    return res.redirect('/donations/new');
  }

  if (parsedUnits <= 0) {
    req.flash('error', 'Units collected must be greater than zero.');
    return res.redirect('/donations/new');
  }

  const initialStatus = VALID_STATUSES.includes(screening_status) ? screening_status : 'PENDING';

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verify donor exists and retrieve blood group
    const [donorRows] = await conn.query(
      'SELECT donor_id, blood_group, full_name FROM donors WHERE donor_id = ?',
      [parsedDonorId]
    );

    if (donorRows.length === 0) {
      await conn.rollback();
      req.flash('error', 'Specified donor does not exist.');
      return res.redirect('/donations/new');
    }

    const donor = donorRows[0];

    // Insert donation
    const [donationResult] = await conn.query(
      `INSERT INTO donations (donation_code, donor_id, donation_date, units_collected, screening_status, screened_by, created_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        donation_code.trim(),
        parsedDonorId,
        donation_date,
        parsedUnits,
        initialStatus,
        initialStatus !== 'PENDING' ? currentUserId : null,
        currentUserId,
        notes ? notes.trim() : null
      ]
    );

    const donationId = donationResult.insertId;

    // If marked CLEARED upon initial creation, generate inventory batch & stock movement inside this same transaction
    if (initialStatus === 'CLEARED') {
      const batchCode = await generateNextBatchCode(conn);
      // Whole blood shelf life: 35 days
      const [batchResult] = await conn.query(
        `INSERT INTO blood_inventory_batches 
         (batch_code, donation_id, blood_group, component_type, units_total, units_available, collection_date, expiry_date, status)
         VALUES (?, ?, ?, 'WHOLE_BLOOD', ?, ?, ?, DATE_ADD(?, INTERVAL 35 DAY), 'AVAILABLE')`,
        [
          batchCode,
          donationId,
          donor.blood_group,
          parsedUnits,
          parsedUnits,
          donation_date,
          donation_date
        ]
      );

      const batchId = batchResult.insertId;

      // Log stock movement audit record (DONATION_IN)
      await conn.query(
        `INSERT INTO stock_movements (batch_id, movement_type, quantity, reference_code, notes, created_by)
         VALUES (?, 'DONATION_IN', ?, ?, ?, ?)`,
        [
          batchId,
          parsedUnits,
          donation_code.trim(),
          `Stock intake from cleared donation (${donor.blood_group})`,
          currentUserId
        ]
      );

      // Update donor last donation date
      await conn.query('UPDATE donors SET last_donation_date = ? WHERE donor_id = ?', [donation_date, parsedDonorId]);
    }

    await conn.commit();
    req.flash('success', `Donation ${donation_code.trim()} successfully recorded! (Status: ${initialStatus})`);
    res.redirect('/donations');
  } catch (err) {
    await conn.rollback();
    console.error('[Donation Create Transaction Error]', err);
    req.flash('error', 'Failed to record donation: ' + err.message);
    res.redirect('/donations/new');
  } finally {
    conn.release();
  }
});

/**
 * POST /donations/:id/screen - Screen existing donation (CLEARED, DEFERRED, REJECTED)
 */
router.post('/:id/screen', requireAuth, async (req, res) => {
  const donationId = parseInt(req.params.id, 10);
  const { new_status, screening_notes } = req.body;
  const currentUserId = req.session.user.user_id;

  if (isNaN(donationId) || !VALID_STATUSES.includes(new_status)) {
    req.flash('error', 'Invalid screening status selected.');
    return res.redirect('/donations');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock donation row
    const [donations] = await conn.query(
      `SELECT d.*, dnr.blood_group, dnr.full_name AS donor_name 
       FROM donations d 
       JOIN donors dnr ON d.donor_id = dnr.donor_id 
       WHERE d.donation_id = ? FOR UPDATE`,
      [donationId]
    );

    if (donations.length === 0) {
      await conn.rollback();
      req.flash('error', 'Donation not found.');
      return res.redirect('/donations');
    }

    const donation = donations[0];

    // Check if an inventory batch already exists for this donation
    const [existingBatches] = await conn.query(
      'SELECT batch_id, batch_code FROM blood_inventory_batches WHERE donation_id = ? FOR UPDATE',
      [donationId]
    );

    // Update screening status on donation
    await conn.query(
      `UPDATE donations 
       SET screening_status = ?, screened_by = ?, notes = CONCAT(COALESCE(notes, ''), ' [Screened: ', ?, ']')
       WHERE donation_id = ?`,
      [new_status, currentUserId, screening_notes ? screening_notes.trim() : new_status, donationId]
    );

    // If new status is CLEARED:
    if (new_status === 'CLEARED') {
      if (existingBatches.length > 0) {
        // Prevent duplicate batch creation if batch already exists
        await conn.query(
          "UPDATE blood_inventory_batches SET status = 'AVAILABLE' WHERE batch_id = ?",
          [existingBatches[0].batch_id]
        );
      } else {
        // Create new inventory batch and stock movement inside transaction
        const batchCode = await generateNextBatchCode(conn);
        const [batchResult] = await conn.query(
          `INSERT INTO blood_inventory_batches 
           (batch_code, donation_id, blood_group, component_type, units_total, units_available, collection_date, expiry_date, status)
           VALUES (?, ?, ?, 'WHOLE_BLOOD', ?, ?, ?, DATE_ADD(?, INTERVAL 35 DAY), 'AVAILABLE')`,
          [
            batchCode,
            donationId,
            donation.blood_group,
            donation.units_collected,
            donation.units_collected,
            donation.donation_date,
            donation.donation_date
          ]
        );

        const batchId = batchResult.insertId;

        // Create stock movement record
        await conn.query(
          `INSERT INTO stock_movements (batch_id, movement_type, quantity, reference_code, notes, created_by)
           VALUES (?, 'DONATION_IN', ?, ?, ?, ?)`,
          [
            batchId,
            donation.units_collected,
            donation.donation_code,
            `Stock intake from cleared donation (${donation.blood_group})`,
            currentUserId
          ]
        );
      }

      // Update donor last donation date
      await conn.query('UPDATE donors SET last_donation_date = ? WHERE donor_id = ?', [donation.donation_date, donation.donor_id]);
    } else {
      // If status is DEFERRED or REJECTED:
      // If a batch previously existed, ensure it cannot be used as available stock
      if (existingBatches.length > 0) {
        await conn.query(
          "UPDATE blood_inventory_batches SET status = 'DISCARDED', units_available = 0 WHERE batch_id = ?",
          [existingBatches[0].batch_id]
        );
      }
    }

    await conn.commit();
    req.flash('success', `Donation ${donation.donation_code} successfully marked as ${new_status}!`);
    res.redirect('/donations');
  } catch (err) {
    await conn.rollback();
    console.error('[Donation Screening Error]', err);
    req.flash('error', 'Screening update failed: ' + err.message);
    res.redirect('/donations');
  } finally {
    conn.release();
  }
});

module.exports = router;
