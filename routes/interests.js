'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// GET tutti gli interests
router.get('/', async (req, res) => {
  try {
    const interests = db.read('interests');
    res.status(200).json({ success: true, data: interests });
  } catch (error) {
    logger.error('getInterests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;