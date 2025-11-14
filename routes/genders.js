'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

// GET tutti i gender
router.get('/', async (req, res) => {
  try {
    // Carica direttamente dal file JSON statico
    const gendersPath = path.join(__dirname, '../public/gender.json');
    const gendersData = fs.readFileSync(gendersPath, 'utf8');
    const genders = JSON.parse(gendersData);
    
    res.status(200).json({ success: true, data: genders });
  } catch (error) {
    logger.error('getGenders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;