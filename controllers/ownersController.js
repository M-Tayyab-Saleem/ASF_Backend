const Owner = require('../models/Owner');
const Tool = require('../models/Tool');

// ── GET /api/owners ─────────────────────────────────────────────────────────
exports.getOwners = async (req, res) => {
  try {
    const owners = await Owner.find().sort({ fullName: 1 }).lean();
    res.json({ success: true, data: owners, meta: { count: owners.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── GET /api/owners/:id ─────────────────────────────────────────────────────
exports.getOwner = async (req, res) => {
  try {
    const owner = await Owner.findById(req.params.id).populate('tools').lean();
    if (!owner) {
      return res.status(404).json({ success: false, error: 'Owner not found', code: 404 });
    }
    res.json({ success: true, data: owner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── POST /api/owners ────────────────────────────────────────────────────────
exports.createOwner = async (req, res) => {
  try {
    const { fullName, email, businessUnit, role, phone } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ success: false, error: 'fullName and email are required', code: 'VALIDATION_ERROR' });
    }

    const existing = await Owner.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, error: 'An owner with this email already exists', code: 'DUPLICATE_EMAIL' });
    }

    const owner = await Owner.create({
      fullName,
      email: email.toLowerCase(),
      businessUnit: businessUnit || '',
      role: role || 'Tool Owner',
      phone: phone || null
    });

    res.status(201).json({ success: true, data: owner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── PUT /api/owners/:id ─────────────────────────────────────────────────────
exports.updateOwner = async (req, res) => {
  try {
    const { fullName, email, businessUnit, role, phone } = req.body;
    
    const owner = await Owner.findById(req.params.id);
    if (!owner) {
      return res.status(404).json({ success: false, error: 'Owner not found', code: 404 });
    }

    if (email && email.toLowerCase() !== owner.email) {
        const existing = await Owner.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email already in use', code: 'DUPLICATE_EMAIL' });
        }
        owner.email = email.toLowerCase();
    }

    if (fullName) owner.fullName = fullName;
    if (businessUnit !== undefined) owner.businessUnit = businessUnit;
    if (role !== undefined) owner.role = role;
    if (phone !== undefined) owner.phone = phone;
    
    owner.updatedAt = new Date();
    await owner.save();

    res.json({ success: true, data: owner });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};

// ── DELETE /api/owners/:id ──────────────────────────────────────────────────
exports.deleteOwner = async (req, res) => {
  try {
    const owner = await Owner.findById(req.params.id);
    if (!owner) {
      return res.status(404).json({ success: false, error: 'Owner not found', code: 404 });
    }

    // Remove ownerId from tools
    await Tool.updateMany({ ownerId: owner._id }, { $set: { ownerId: null } });

    await Owner.findByIdAndDelete(req.params.id);

    res.json({ success: true, data: { message: 'Owner deleted successfully' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
