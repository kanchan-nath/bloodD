const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

/**
 * Generate next hospital code (e.g. HSP-007)
 */
async function generateNextHospitalCode() {
  const [rows] = await pool.query(
    "SELECT hospital_code FROM hospitals WHERE hospital_code LIKE 'HSP-%' ORDER BY hospital_id DESC LIMIT 1"
  );
  if (rows.length === 0) return 'HSP-001';
  const match = rows[0].hospital_code.match(/HSP-(\d+)/);
  if (!match) return `HSP-${Date.now().toString().slice(-3)}`;
  const nextNum = parseInt(match[1], 10) + 1;
  return `HSP-${String(nextNum).padStart(3, '0')}`;
}

/**
 * GET /hospitals - List and search hospitals
 */
router.get('/', requireAuth, async (req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT h.*,
           (SELECT COUNT(*) FROM blood_requests WHERE hospital_id = h.hospital_id) AS total_requests
    FROM hospitals h
    WHERE 1=1
  `;
  const params = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    sql += ` AND (h.hospital_name LIKE ? OR h.hospital_code LIKE ? OR h.city LIKE ? OR h.contact_person LIKE ?)`;
    params.push(term, term, term, term);
  }

  sql += ` ORDER BY h.hospital_id DESC`;

  try {
    const [hospitals] = await pool.query(sql, params);
    res.render('hospitals/index', {
      title: 'Hospital Partners Management',
      hospitals,
      q: q || ''
    });
  } catch (err) {
    console.error('[Hospitals List Error]', err);
    req.flash('error', 'Error loading hospitals: ' + err.message);
    res.redirect('/dashboard');
  }
});

/**
 * GET /hospitals/new - Show hospital creation form
 */
router.get('/new', requireAuth, async (req, res) => {
  try {
    const suggestedCode = await generateNextHospitalCode();
    res.render('hospitals/form', {
      title: 'Add Partner Hospital',
      hospital: { hospital_code: suggestedCode },
      isEdit: false
    });
  } catch (err) {
    console.error('[Hospital New Error]', err);
    req.flash('error', 'Error generating hospital form.');
    res.redirect('/hospitals');
  }
});

/**
 * POST /hospitals - Create hospital
 */
router.post('/', requireAuth, async (req, res) => {
  const { hospital_code, hospital_name, contact_person, phone, email, city, address } = req.body;

  if (!hospital_code || !hospital_name || !contact_person || !city) {
    req.flash('error', 'Hospital code, name, contact person, and city are required.');
    return res.redirect('/hospitals/new');
  }

  try {
    // Check uniqueness of hospital_code
    const [existing] = await pool.query('SELECT hospital_id FROM hospitals WHERE hospital_code = ?', [hospital_code.trim()]);
    if (existing.length > 0) {
      req.flash('error', `A hospital with code "${hospital_code.trim()}" already exists.`);
      return res.redirect('/hospitals/new');
    }

    await pool.query(
      `INSERT INTO hospitals (hospital_code, hospital_name, contact_person, phone, email, city, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        hospital_code.trim(),
        hospital_name.trim(),
        contact_person.trim(),
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        city.trim(),
        address ? address.trim() : null
      ]
    );

    req.flash('success', `Hospital "${hospital_name.trim()}" (${hospital_code.trim()}) registered successfully.`);
    res.redirect('/hospitals');
  } catch (err) {
    console.error('[Hospital Create Error]', err);
    req.flash('error', 'Failed to register hospital: ' + err.message);
    res.redirect('/hospitals/new');
  }
});

/**
 * GET /hospitals/:id/edit - Show edit form
 */
router.get('/:id/edit', requireAuth, async (req, res) => {
  const hospitalId = parseInt(req.params.id, 10);
  if (isNaN(hospitalId)) return res.redirect('/hospitals');

  try {
    const [hospitals] = await pool.query('SELECT * FROM hospitals WHERE hospital_id = ?', [hospitalId]);
    if (hospitals.length === 0) {
      req.flash('error', 'Hospital not found.');
      return res.redirect('/hospitals');
    }

    res.render('hospitals/form', {
      title: `Edit Hospital: ${hospitals[0].hospital_name}`,
      hospital: hospitals[0],
      isEdit: true
    });
  } catch (err) {
    console.error('[Hospital Edit Load Error]', err);
    req.flash('error', 'Error loading edit form.');
    res.redirect('/hospitals');
  }
});

/**
 * POST /hospitals/:id/edit - Update hospital
 */
router.post('/:id/edit', requireAuth, async (req, res) => {
  const hospitalId = parseInt(req.params.id, 10);
  if (isNaN(hospitalId)) return res.redirect('/hospitals');

  const { hospital_name, contact_person, phone, email, city, address } = req.body;

  if (!hospital_name || !contact_person || !city) {
    req.flash('error', 'Name, contact person, and city are required.');
    return res.redirect(`/hospitals/${hospitalId}/edit`);
  }

  try {
    await pool.query(
      `UPDATE hospitals 
       SET hospital_name = ?, contact_person = ?, phone = ?, email = ?, city = ?, address = ?
       WHERE hospital_id = ?`,
      [
        hospital_name.trim(),
        contact_person.trim(),
        phone ? phone.trim() : null,
        email ? email.trim() : null,
        city.trim(),
        address ? address.trim() : null,
        hospitalId
      ]
    );

    req.flash('success', `Hospital "${hospital_name.trim()}" updated successfully.`);
    res.redirect('/hospitals');
  } catch (err) {
    console.error('[Hospital Update Error]', err);
    req.flash('error', 'Failed to update hospital: ' + err.message);
    res.redirect(`/hospitals/${hospitalId}/edit`);
  }
});

/**
 * POST /hospitals/:id/delete - Delete hospital with foreign key check
 */
router.post('/:id/delete', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const hospitalId = parseInt(req.params.id, 10);
  if (isNaN(hospitalId)) return res.redirect('/hospitals');

  try {
    // Check if hospital is referenced in blood_requests
    const [[{ request_count }]] = await pool.query(
      'SELECT COUNT(*) AS request_count FROM blood_requests WHERE hospital_id = ?',
      [hospitalId]
    );

    if (request_count > 0) {
      req.flash(
        'error',
        `Cannot delete hospital (ID ${hospitalId}): ${request_count} blood request(s) are linked to this facility. DBMS foreign key constraints maintain referential integrity and prevent orphaned records.`
      );
      return res.redirect('/hospitals');
    }

    const [result] = await pool.query('DELETE FROM hospitals WHERE hospital_id = ?', [hospitalId]);
    if (result.affectedRows > 0) {
      req.flash('success', `Hospital #${hospitalId} deleted successfully.`);
    } else {
      req.flash('error', 'Hospital not found.');
    }
    res.redirect('/hospitals');
  } catch (err) {
    console.error('[Hospital Delete Error]', err);
    req.flash('error', 'Database deletion error: ' + err.message);
    res.redirect('/hospitals');
  }
});

module.exports = router;
