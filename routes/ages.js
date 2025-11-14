'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

// GET tutte le fasce d'età
router.get('/', async (req, res, next) => {
  try {
    // Carica direttamente dal file JSON statico
    const agesPath = path.join(__dirname, '../public/ages.json');
    const agesData = fs.readFileSync(agesPath, 'utf8');
    const ages = JSON.parse(agesData);
    
    res.status(200).json({ success: true, data: ages });
  } catch (error) {
    logger.error('getAges:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;