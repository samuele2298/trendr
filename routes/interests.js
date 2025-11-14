'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// GET tutti gli interests
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
          id,
          "Tinterest_name" name,
          "Tinterest_color" color
      FROM "Tinterest" 
      ORDER BY id;
    `;
    const interests = await db.any(query);

    res.status(200).json({ success: true, data: interests });
  } catch (error) {
    logger.error('getInterests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;