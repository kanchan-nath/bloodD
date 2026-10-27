const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_URGENCIES = ['ROUTINE', 'URGENT', 'EMERGENCY'];
const VALID_STATUSES = ['PENDING', 'APPROVED', 'FULFILLED', 'REJECTED', 'CANCELLED'];

/**
 * Generate next sequential request code (e.g. REQ-2026-0013)
 */
async function generateNextRequestCode() {
  const year = new Date().getFullYear();
  const prefix = `REQ-${year}-`;
  const [rows] = await pool.query(
    'SELECT request_code FROM blood_requests WHERE request_code LIKE ? ORDER BY request_id DESC LIMIT 1',
    [`${prefix}%`]
  );
  if (rows.length === 0) return `${prefix}0001`;
  const match = rows[0].request_code.match(/REQ-\d+-(\d+)/);
  if (!match) return `${prefix}${Date.now().toString().slice(-4)}`;
  const nextNum = parseInt(match[1], 10) + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * Generate next sequential issue code (e.g. ISS-2026-0006)
 */
async function generateNextIssueCode(conn) {
  const year = new Date().getFullYear();
  const prefix = `ISS-${year}-`;
  const [rows] = await conn.query(
    'SELECT issue_code FROM blood_issues WHERE issue_code LIKE ? ORDER BY issue_id DESC LIMIT 1 FOR UPDATE',
    [`${prefix}%`]
  );
  if (rows.length === 0) return `${prefix}0001`;
  const match = rows[0].issue_code.match(/ISS-\d+-(\d+)/);
  if (!match) return `${prefix}${Date.now().toString().slice(-4)}`;
  const nextNum = parseInt(match[1], 10) + 1;
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * GET /requests - List and filter hospital blood requests
 */
router.get('/', requireAuth, async (req, res) => {
  const { hospital_id, blood_group, urgency, status, q } = req.query;

  let sql = `
    SELECT r.*, 
           h.hospital_name, h.hospital_code, h.city AS hospital_city,
           u_created.full_name AS created_by_name,
           u_handled.full_name AS handled_by_name,
           (SELECT COALESCE(SUM(units_issued), 0) FROM blood_issues WHERE request_id = r.request_id) AS total_units_issued
    FROM blood_requests r
    JOIN hospitals h ON r.hospital_id = h.hospital_id
    JOIN users u_created ON r.created_by = u_created.user_id
    LEFT JOIN users u_handled ON r.handled_by = u_handled.user_id
    WHERE 1=1
  `;
  const params = [];

  if (hospital_id) {
    const hid = parseInt(hospital_id, 10);
    if (!isNaN(hid)) {
      sql += ` AND r.hospital_id = ?`;
      params.push(hid);
    }
  }

  if (blood_group && VALID_BLOOD_GROUPS.includes(blood_group)) {
    sql += ` AND r.blood_group = ?`;
    params.push(blood_group);
  }

  if (urgency && VALID_URGENCIES.includes(urgency)) {
    sql += ` AND r.urgency = ?`;
    params.push(urgency);
  }

  if (status && VALID_STATUSES.includes(status)) {
    sql += ` AND r.status = ?`;
    params.push(status);
  }

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    sql += ` AND (r.request_code LIKE ? OR h.hospital_name LIKE ? OR r.patient_reference LIKE ?)`;
    params.push(term, term, term);
  }

  sql += ` ORDER BY FIELD(r.urgency, 'EMERGENCY', 'URGENT', 'ROUTINE'), r.requested_at DESC, r.request_id DESC`;

  try {
    const [requests] = await pool.query(sql, params);
    const [hospitals] = await pool.query('SELECT hospital_id, hospital_name FROM hospitals ORDER BY hospital_name ASC');

    res.render('requests/index', {
      title: 'Blood Requests & Clinical Requisitions',
      requests,
      hospitals,
      selectedHospital: hospital_id || '',
      selectedBloodGroup: blood_group || '',
      selectedUrgency: urgency || '',
      selectedStatus: status || '',
      q: q || '',
      validBloodGroups: VALID_BLOOD_GROUPS,
      validUrgencies: VALID_URGENCIES,
      validStatuses: VALID_STATUSES
    });
  } catch (err) {
    console.error('[Requests List Error]', err);
    req.flash('error', 'Error loading requests: ' + err.message);
    res.redirect('/dashboard');
  }
});

/**
 * GET /requests/new - Form to create a new blood request
 */
router.get('/new', requireAuth, async (req, res) => {
  try {
    const suggestedCode = await generateNextRequestCode();
    const [hospitals] = await pool.query('SELECT hospital_id, hospital_code, hospital_name, city FROM hospitals ORDER BY hospital_name ASC');

    res.render('requests/form', {
      title: 'Create Hospital Blood Request',
      suggestedCode,
      hospitals,
      validBloodGroups: VALID_BLOOD_GROUPS,
      validUrgencies: VALID_URGENCIES
    });
  } catch (err) {
    console.error('[Request New Form Error]', err);
    req.flash('error', 'Error preparing request form.');
    res.redirect('/requests');
  }
});

/**
 * POST /requests - Create blood request
 */
router.post('/', requireAuth, async (req, res) => {
  const { request_code, hospital_id, blood_group, units_requested, urgency, required_by, patient_reference, notes } = req.body;
  const currentUserId = req.session.user.user_id;

  const parsedHospitalId = parseInt(hospital_id, 10);
  const parsedUnits = parseInt(units_requested, 10);

  if (!request_code || isNaN(parsedHospitalId) || !blood_group || isNaN(parsedUnits) || parsedUnits <= 0) {
    req.flash('error', 'Request code, hospital, valid blood group, and positive units requested are required.');
    return res.redirect('/requests/new');
  }

  if (!VALID_BLOOD_GROUPS.includes(blood_group)) {
    req.flash('error', 'Invalid blood group specified.');
    return res.redirect('/requests/new');
  }

  const selectedUrgency = VALID_URGENCIES.includes(urgency) ? urgency : 'ROUTINE';

  try {
    // Check uniqueness of request_code
    const [existing] = await pool.query('SELECT request_id FROM blood_requests WHERE request_code = ?', [request_code.trim()]);
    if (existing.length > 0) {
      req.flash('error', `A request with code "${request_code.trim()}" already exists.`);
      return res.redirect('/requests/new');
    }

    await pool.query(
      `INSERT INTO blood_requests 
       (request_code, hospital_id, blood_group, component_type, units_requested, urgency, status, required_by, patient_reference, notes, created_by)
       VALUES (?, ?, ?, 'WHOLE_BLOOD', ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [
        request_code.trim(),
        parsedHospitalId,
        blood_group,
        parsedUnits,
        selectedUrgency,
        required_by || null,
        patient_reference ? patient_reference.trim() : null,
        notes ? notes.trim() : null,
        currentUserId
      ]
    );

    req.flash('success', `Blood request ${request_code.trim()} submitted successfully for ${parsedUnits} unit(s) of ${blood_group}.`);
    res.redirect('/requests');
  } catch (err) {
    console.error('[Request Create Error]', err);
    req.flash('error', 'Failed to create request: ' + err.message);
    res.redirect('/requests/new');
  }
});

/**
 * GET /requests/:id - Inspect request, view stock availability, and fulfill
 */
router.get('/:id', requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId)) return res.redirect('/requests');

  try {
    const [requests] = await pool.query(
      `SELECT r.*, 
              h.hospital_name, h.hospital_code, h.city AS hospital_city, h.phone AS hospital_phone, h.contact_person,
              u_created.full_name AS created_by_name,
              u_handled.full_name AS handled_by_name
       FROM blood_requests r
       JOIN hospitals h ON r.hospital_id = h.hospital_id
       JOIN users u_created ON r.created_by = u_created.user_id
       LEFT JOIN users u_handled ON r.handled_by = u_handled.user_id
       WHERE r.request_id = ?`,
      [requestId]
    );

    if (requests.length === 0) {
      req.flash('error', 'Request not found.');
      return res.redirect('/requests');
    }

    const request = requests[0];

    // Check available units in stock for this EXACT blood group (excluding expired)
    const [stockRows] = await pool.query(
      `SELECT COALESCE(SUM(units_available), 0) AS total_available 
       FROM blood_inventory_batches 
       WHERE blood_group = ? 
         AND status = 'AVAILABLE' 
         AND units_available > 0 
         AND expiry_date >= CURDATE()`,
      [request.blood_group]
    );
    const availableStock = parseInt(stockRows[0].total_available, 10) || 0;

    // Fetch any issues already made for this request
    const [issues] = await pool.query(
      `SELECT bi.*, b.batch_code, b.blood_group, b.expiry_date, u.full_name AS issued_by_name
       FROM blood_issues bi
       JOIN blood_inventory_batches b ON bi.batch_id = b.batch_id
       JOIN users u ON bi.issued_by = u.user_id
       WHERE bi.request_id = ?
       ORDER BY bi.issued_at ASC`,
      [requestId]
    );

    // Eligible batches that would be picked by FIFO (earliest-expiry-first)
    const [eligibleBatches] = await pool.query(
      `SELECT batch_id, batch_code, blood_group, units_available, collection_date, expiry_date,
              DATEDIFF(expiry_date, CURDATE()) AS days_left
       FROM blood_inventory_batches
       WHERE blood_group = ?
         AND status = 'AVAILABLE'
         AND units_available > 0
         AND expiry_date >= CURDATE()
       ORDER BY expiry_date ASC, batch_id ASC`,
      [request.blood_group]
    );

    res.render('requests/view', {
      title: `Request Details: ${request.request_code}`,
      request,
      availableStock,
      issues,
      eligibleBatches
    });
  } catch (err) {
    console.error('[Request View Error]', err);
    req.flash('error', 'Error retrieving request: ' + err.message);
    res.redirect('/requests');
  }
});

/**
 * POST /requests/:id/status - Approve or reject pending request
 */
router.post('/:id/status', requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const { new_status } = req.body;
  const currentUserId = req.session.user.user_id;

  if (isNaN(requestId) || !['APPROVED', 'REJECTED', 'CANCELLED'].includes(new_status)) {
    req.flash('error', 'Invalid status update requested.');
    return res.redirect('/requests');
  }

  try {
    const [result] = await pool.query(
      `UPDATE blood_requests 
       SET status = ?, handled_by = ? 
       WHERE request_id = ? AND status IN ('PENDING', 'APPROVED')`,
      [new_status, currentUserId, requestId]
    );

    if (result.affectedRows > 0) {
      req.flash('success', `Request #${requestId} status updated to ${new_status}.`);
    } else {
      req.flash('error', 'Request could not be updated or is already fulfilled/closed.');
    }

    res.redirect(`/requests/${requestId}`);
  } catch (err) {
    console.error('[Request Status Error]', err);
    req.flash('error', 'Status update failed: ' + err.message);
    res.redirect(`/requests/${requestId}`);
  }
});

/**
 * POST /requests/:id/issue - Fulfill request with atomic MySQL transaction
 */
router.post('/:id/issue', requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const currentUserId = req.session.user.user_id;

  if (isNaN(requestId)) return res.redirect('/requests');

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Lock the request row
    const [requests] = await conn.query(
      `SELECT r.*, h.hospital_name 
       FROM blood_requests r 
       JOIN hospitals h ON r.hospital_id = h.hospital_id 
       WHERE r.request_id = ? FOR UPDATE`,
      [requestId]
    );

    if (requests.length === 0) {
      await conn.rollback();
      req.flash('error', 'Request record not found.');
      return res.redirect('/requests');
    }

    const request = requests[0];

    // 2. Only APPROVED requests can be fulfilled
    if (request.status !== 'APPROVED') {
      await conn.rollback();
      req.flash('error', `Cannot fulfill request: Status is "${request.status}". Only APPROVED requests can be fulfilled.`);
      return res.redirect(`/requests/${requestId}`);
    }

    // 3. Check already issued units for this request
    const [[{ total_issued }]] = await conn.query(
      'SELECT COALESCE(SUM(units_issued), 0) AS total_issued FROM blood_issues WHERE request_id = ? FOR UPDATE',
      [requestId]
    );

    const unitsNeeded = request.units_requested - total_issued;
    if (unitsNeeded <= 0) {
      // Already fully issued
      await conn.query("UPDATE blood_requests SET status = 'FULFILLED', handled_by = ? WHERE request_id = ?", [currentUserId, requestId]);
      await conn.commit();
      req.flash('success', `Request ${request.request_code} has already been completely fulfilled.`);
      return res.redirect(`/requests/${requestId}`);
    }

    // 4. Lock eligible batches: exact requested blood group, AVAILABLE, not expired, earliest-expiry-first
    const [eligibleBatches] = await conn.query(
      `SELECT batch_id, batch_code, units_available, expiry_date 
       FROM blood_inventory_batches 
       WHERE blood_group = ? 
         AND status = 'AVAILABLE' 
         AND units_available > 0 
         AND expiry_date >= CURDATE() 
       ORDER BY expiry_date ASC, batch_id ASC 
       FOR UPDATE`,
      [request.blood_group]
    );

    // 5. Verify enough units exist across eligible batches
    const totalAvailable = eligibleBatches.reduce((acc, b) => acc + b.units_available, 0);

    if (totalAvailable < unitsNeeded) {
      await conn.rollback();
      req.flash(
        'error',
        `Insufficient stock to fulfill request! Required: ${unitsNeeded} unit(s) of ${request.blood_group}, but only ${totalAvailable} eligible non-expired unit(s) are available in inventory.`
      );
      return res.redirect(`/requests/${requestId}`);
    }

    // 6. Allocate stock from batches in earliest-expiry-first order
    let unitsRemaining = unitsNeeded;

    for (const batch of eligibleBatches) {
      if (unitsRemaining <= 0) break;

      const take = Math.min(batch.units_available, unitsRemaining);
      const newAvailable = batch.units_available - take;
      const newStatus = (newAvailable === 0) ? 'EMPTY' : 'AVAILABLE';

      // Decrement batch units and update status
      await conn.query(
        'UPDATE blood_inventory_batches SET units_available = ?, status = ? WHERE batch_id = ?',
        [newAvailable, newStatus, batch.batch_id]
      );

      // Generate unique issue code
      const issueCode = await generateNextIssueCode(conn);

      // Insert blood_issues row
      await conn.query(
        `INSERT INTO blood_issues (issue_code, request_id, batch_id, units_issued, issued_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          issueCode,
          requestId,
          batch.batch_id,
          take,
          currentUserId,
          `Stock fulfilled for request ${request.request_code} (${request.hospital_name})`
        ]
      );

      // Insert stock_movements row (ISSUE_OUT)
      await conn.query(
        `INSERT INTO stock_movements (batch_id, movement_type, quantity, reference_code, notes, created_by)
         VALUES (?, 'ISSUE_OUT', ?, ?, ?, ?)`,
        [
          batch.batch_id,
          take,
          issueCode,
          `Stock issued against request ${request.request_code}`,
          currentUserId
        ]
      );

      unitsRemaining -= take;
    }

    // 7. Update request status to FULFILLED
    await conn.query(
      `UPDATE blood_requests 
       SET status = 'FULFILLED', handled_by = ? 
       WHERE request_id = ?`,
      [currentUserId, requestId]
    );

    // 8. Commit atomic transaction
    await conn.commit();

    req.flash(
      'success',
      `Success! Request ${request.request_code} fulfilled: ${unitsNeeded} unit(s) of ${request.blood_group} issued to ${request.hospital_name} in atomic transaction.`
    );
    res.redirect(`/requests/${requestId}`);
  } catch (err) {
    await conn.rollback();
    console.error('[Stock Issue Transaction Error]', err);
    req.flash('error', 'Stock fulfillment transaction failed and rolled back: ' + err.message);
    res.redirect(`/requests/${requestId}`);
  } finally {
    conn.release();
  }
});

module.exports = router;
