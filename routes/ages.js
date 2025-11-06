'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// GET tutte le fasce d'età
router.get('/', async (req, res, next) => {
  try {
    const ages = db.read('ages');
    res.status(200).json({ success: true, data: ages });
  } catch (error) {
    logger.error('getAges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;