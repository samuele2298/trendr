'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// GET tutti i tags
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
          id,
          "Ttag_name" name,
          "Ttag_color" color
      FROM "Ttag" 
      ORDER BY id;
    `;
    const tags = await db.any(query);
    
    res.status(200).json({ success: true, data: tags });
  } catch (error) {
    logger.error('getTags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;