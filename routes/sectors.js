'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');
const path = require('path');
const fs = require('fs');

// GET tutti i sector
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
          id,
          "Tsector_name" name,
          "Tsector_color" color
      FROM "Tsector" 
      ORDER BY id;
    `;
    const sectors = await db.any(query);
        
    res.status(200).json({ success: true, data: sectors });
  } catch (error) {
    logger.error('getSectors:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;