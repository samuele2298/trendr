'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// GET tutti i gender
router.get('/', async (req, res) => {
  try {
    const genders = db.read('gender');
    res.status(200).json({ success: true, data: genders });
  } catch (error) {
    logger.error('getGenders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;