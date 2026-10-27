const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const VALID_GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];

/**
 * Generate next sequential donor code (e.g. DNR-0033)
 */
async function generateNextDonorCode() {
  const [rows] = await pool.query(
    "SELECT donor_code FROM donors WHERE donor_code LIKE 'DNR-%' ORDER BY donor_id DESC LIMIT 1"
  );
  if (rows.length === 0) return 'DNR-0001';
  const match = rows[0].donor_code.match(/DNR-(\d+)/);
  if (!match) return `DNR-${Date.now().toString().slice(-4)}`;
  const nextNum = parseInt(match[1], 10) + 1;
  return `DNR-${String(nextNum).padStart(4, '0')}`;
}

/**
 * GET /donors - List and search donors
 */
router.get('/', requireAuth, async (req, res) => {
  const { q, blood_group } = req.query;
  let sql = `
    SELECT d.*, 
           (SELECT COUNT(*) FROM donations WHERE donor_id = d.donor_id) AS total_donations
    FROM donors d
    WHERE 1=1
  `;
  const params = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    sql += ` AND (d.full_name LIKE ? OR d.donor_code LIKE ? OR d.city LIKE ? OR d.phone LIKE ?)`;
    params.push(term, term, term, term);
  }

  if (blood_group && VALID_BLOOD_GROUPS.includes(blood_group)) {
    sql += ` AND d.blood_group = ?`;
    params.push(blood_group);
  }

  sql += ` ORDER BY d.donor_id DESC`;

  try {
    const [donors] = await pool.query(sql, params);
    res.render('donors/index', {
      title: 'Donor Management',
      donors,
      q: q || '',
      selectedBloodGroup: blood_group || '',
      validBloodGroups: VALID_BLOOD_GROUPS
    });
  } catch (err) {
    console.error('[Donors List Error]', err);
    req.flash('error', 'Error loading donors: ' + err.message);
    res.redirect('/dashboard');
  }
});

/**
 * GET /donors/new - Show donor creation form
 */
router.get('/new', requireAuth, async (req, res) => {
  try {
    const suggestedCode = await generateNextDonorCode();
    res.render('donors/form', {
      title: 'Register New Donor',
      donor: { donor_code: suggestedCode },
      isEdit: false,
      validBloodGroups: VALID_BLOOD_GROUPS,
      validGenders: VALID_GENDERS
    });
  } catch (err) {
    console.error('[Donor New Error]', err);
    req.flash('error', 'Error preparing donor form.');
    res.redirect('/donors');
  }
});

/**
 * POST /donors - Create new donor record
 */
router.post('/', requireAuth, async (req, res) => {
  const { donor_code, full_name, date_of_birth, gender, blood_group, phone, email, city } = req.body;

  // Validation
  if (!donor_code || !full_name || !date_of_birth || !gender || !blood_group || !city) {
    req.flash('error', 'All required fields (Code, Name, DOB, Gender, Blood Group, City) must be provided.');
    return res.redirect('/donors/new');
  }

  if (!VALID_BLOOD_GROUPS.includes(blood_group)) {
    req.flash('error', 'Invalid blood group specified.');
    return res.redirect('/donors/new');
  }

  if (!VALID_GENDERS.includes(gender)) {
    req.flash('error', 'Invalid gender option.');
    return res.redirect('/donors/new');
  }

  try {
    // Check for duplicate donor code
    const [existing] = await pool.query('SELECT donor_id FROM donors WHERE donor_code = ?', [donor_code.trim()]);
    if (existing.length > 0) {
      req.flash('error', `A donor with code "${donor_code.trim()}" already exists. Please choose a unique code.`);
      return res.redirect('/donors/new');
    }

    await pool.query(
      `INSERT INTO donors (donor_code, full_name, date_of_birth, gender, blood_group, phone, email, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        donor_code.trim(),
        full_name.trim(),
        date_of_birth,
        gender,
        blood_group,
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        city.trim()
      ]
    );

    req.flash('success', `Donor ${full_name.trim()} (${donor_code.trim()}) registered successfully!`);
    res.redirect('/donors');
  } catch (err) {
    console.error('[Donor Create Error]', err);
    req.flash('error', 'Failed to register donor: ' + err.message);
    res.redirect('/donors/new');
  }
});

/**
 * GET /donors/:id - View donor details and donation history
 */
router.get('/:id', requireAuth, async (req, res) => {
  const donorId = parseInt(req.params.id, 10);
  if (isNaN(donorId)) return res.redirect('/donors');

  try {
    const [donors] = await pool.query('SELECT * FROM donors WHERE donor_id = ?', [donorId]);
    if (donors.length === 0) {
      req.flash('error', 'Donor not found.');
      return res.redirect('/donors');
    }

    const donor = donors[0];

    // Get all donation records for this donor
    const [donations] = await pool.query(
      `SELECT d.*, u.full_name AS created_by_name, s.full_name AS screened_by_name,
              b.batch_code, b.status AS batch_status
       FROM donations d
       LEFT JOIN users u ON d.created_by = u.user_id
       LEFT JOIN users s ON d.screened_by = s.user_id
       LEFT JOIN blood_inventory_batches b ON d.donation_id = b.donation_id
       WHERE d.donor_id = ?
       ORDER BY d.donation_date DESC, d.donation_id DESC`,
      [donorId]
    );

    res.render('donors/view', {
      title: `Donor Profile: ${donor.full_name}`,
      donor,
      donations
    });
  } catch (err) {
    console.error('[Donor View Error]', err);
    req.flash('error', 'Error retrieving donor details: ' + err.message);
    res.redirect('/donors');
  }
});

/**
 * GET /donors/:id/edit - Show donor edit form
 */
router.get('/:id/edit', requireAuth, async (req, res) => {
  const donorId = parseInt(req.params.id, 10);
  if (isNaN(donorId)) return res.redirect('/donors');

  try {
    const [donors] = await pool.query('SELECT * FROM donors WHERE donor_id = ?', [donorId]);
    if (donors.length === 0) {
      req.flash('error', 'Donor not found.');
      return res.redirect('/donors');
    }

    res.render('donors/form', {
      title: `Edit Donor: ${donors[0].full_name}`,
      donor: donors[0],
      isEdit: true,
      validBloodGroups: VALID_BLOOD_GROUPS,
      validGenders: VALID_GENDERS
    });
  } catch (err) {
    console.error('[Donor Edit Load Error]', err);
    req.flash('error', 'Error opening edit form.');
    res.redirect('/donors');
  }
});

/**
 * POST /donors/:id/edit - Update donor details
 */
router.post('/:id/edit', requireAuth, async (req, res) => {
  const donorId = parseInt(req.params.id, 10);
  if (isNaN(donorId)) return res.redirect('/donors');

  const { full_name, date_of_birth, gender, blood_group, phone, email, city } = req.body;

  if (!full_name || !date_of_birth || !gender || !blood_group || !city) {
    req.flash('error', 'All required fields must be filled.');
    return res.redirect(`/donors/${donorId}/edit`);
  }

  try {
    await pool.query(
      `UPDATE donors 
       SET full_name = ?, date_of_birth = ?, gender = ?, blood_group = ?, 
           phone = ?, email = ?, city = ?
       WHERE donor_id = ?`,
      [
        full_name.trim(),
        date_of_birth,
        gender,
        blood_group,
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        city.trim(),
        donorId
      ]
    );

    req.flash('success', `Donor profile for ${full_name.trim()} updated successfully.`);
    res.redirect(`/donors/${donorId}`);
  } catch (err) {
    console.error('[Donor Update Error]', err);
    req.flash('error', 'Update failed: ' + err.message);
    res.redirect(`/donors/${donorId}/edit`);
  }
});

/**
 * POST /donors/:id/delete - Delete donor with referential integrity check
 */
router.post('/:id/delete', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const donorId = parseInt(req.params.id, 10);
  if (isNaN(donorId)) return res.redirect('/donors');

  try {
    // 1. Check for foreign key reference in donations table
    const [[{ donation_count }]] = await pool.query(
      'SELECT COUNT(*) AS donation_count FROM donations WHERE donor_id = ?',
      [donorId]
    );

    if (donation_count > 0) {
      req.flash(
        'error',
        `Cannot delete donor (ID ${donorId}): ${donation_count} donation record(s) reference this donor. Relational integrity prevents orphaned donation history.`
      );
      return res.redirect('/donors');
    }

    // 2. Perform safe deletion
    const [result] = await pool.query('DELETE FROM donors WHERE donor_id = ?', [donorId]);
    if (result.affectedRows > 0) {
      req.flash('success', `Donor record #${donorId} deleted successfully.`);
    } else {
      req.flash('error', 'Donor was not found.');
    }
    res.redirect('/donors');
  } catch (err) {
    console.error('[Donor Delete Error]', err);
    req.flash('error', 'Database deletion error: ' + err.message);
    res.redirect('/donors');
  }
});

module.exports = router;
