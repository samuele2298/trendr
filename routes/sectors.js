'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// GET tutti i sector
router.get('/', async (req, res) => {
  try {
    const sectors = db.read('sectors');
    res.status(200).json({ success: true, data: sectors });
  } catch (error) {
    logger.error('getSectors:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;