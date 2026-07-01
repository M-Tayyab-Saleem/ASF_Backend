const Control = require('../models/Control');

exports.updateStatus = async (req, res) => {
  try {
    const { controlId } = req.params;
    const { status } = req.body;

    if (!['Implemented', 'Not Implemented'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be either "Implemented" or "Not Implemented"',
        code: 'VALIDATION_ERROR'
      });
    }

    const control = await Control.findOne({ controlId });
    if (!control) {
      return res.status(404).json({ success: false, error: 'Control not found', code: 'NOT_FOUND' });
    }

    control.status = status;
    control.statusUpdatedBy = req.user._id;
    control.statusUpdatedAt = new Date();
    await control.save();

    const populated = await Control.findOne({ controlId })
      .populate('statusUpdatedBy', 'fullName email');

    res.json({
      success: true,
      data: populated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, code: 500 });
  }
};
