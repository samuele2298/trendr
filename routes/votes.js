'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');
const fs = require('fs');
const path = require('path');

// POST vota una question
router.post('/', async (req, res, next) => {
  try {
    const { questionId } = req.body;
    let { user } = req.body;
    const batch = req.body.votes; // optional array of votes

    // Helper to process one vote item { questionId, user }
    const processVote = async (voteItem) => {
      try {
        const qId = voteItem.questionId;
        let u = voteItem.user;
        let vote = voteItem.vote;
        if (!qId) 
          return { success: false, error: 'questionId is required' };

        // parse user if string
        let uObj = null;
        if (u) {
          try { uObj = typeof u === 'string' ? JSON.parse(u) : u; } catch (e) { uObj = null; }
        }
        if (!uObj || !uObj.id) {
          uObj = { id: `anon_${Date.now()}_${Math.floor(Math.random() * 10000)}` };
        }

        // Check question exists
        const questionQuery = `SELECT id FROM "Tquestion" WHERE id = $1`;
        const questionExists = await db.oneOrNone(questionQuery, [qId.toString()]);
        if (!questionExists) 
          return { success: false, error: 'Question not found', questionId: qId };

        // Validate/clean optional fields
        // gender - carica da file JSON statico
        if (uObj.gender) {
          const gendersPath = path.join(__dirname, '../public/gender.json');
          const gendersData = fs.readFileSync(gendersPath, 'utf8');
          const genders = JSON.parse(gendersData);
          const validGender = genders.find(g => g.id == uObj.gender);
          if (!validGender) delete uObj.gender;
        }
        
        // sector - carica da tabella sectors
        if (uObj.sector) {
          const sectorQuery = `SELECT id FROM "Tsector" WHERE id = $1`;
          const validSector = await db.oneOrNone(sectorQuery, [uObj.sector]);
          if (!validSector) delete uObj.sector;
        }
        
        // age - carica da file JSON statico
        if (uObj.age) {
          const agesPath = path.join(__dirname, '../public/ages.json');
          const agesData = fs.readFileSync(agesPath, 'utf8');
          const ages = JSON.parse(agesData);
          const validAge = ages.find(a => a.id == uObj.age || a.name === uObj.age);
          if (!validAge) delete uObj.age;
        }

        // create new vote
        const insertQuery = `
          INSERT INTO "Tvote" (
            "Tvote_Tquestion_id", "Tvote_userid", "Tvote_vote", "Tvote_createtime",
            "Tvote_userinterest", "Tvote_userage", "Tvote_usergender", "Tvote_usersector", "Tvote_userlocation"
          ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
          RETURNING "Tvote_createtime"
        `;
        const result = await db.one(insertQuery, [
          qId,
          uObj.id,
          vote,
          JSON.stringify(uObj.interests) || null,
          uObj.age || null,
          uObj.gender || null,
          uObj.sector || null,
          uObj.location || null
        ]);
        
        return { success: true, data: { questionId: qId, userId: uObj.id, timestamp: result.Tvote_createtime } };
      } catch (err) {
        return { success: false, error: err.message };
      }
    };

    // Se abbiamo un batch, processalo
    if (Array.isArray(batch)) {
      const results = await Promise.all(batch.map(item => processVote(item)));
      return res.status(200).json({ success: true, results });
    }

    // Altrimenti processa come singolo voto usando la stessa logica
    if (!questionId) {
      return res.status(400).json({ success: false, error: 'questionId is required' });
    }

    const result = await processVote({ questionId, user });
    
    if (!result.success) {
      const statusCode = result.error.includes('not found') ? 404 : 
                        result.error.includes('already voted') ? 409 : 400;
      return res.status(statusCode).json(result);
    }

    // Risposta singola con formato originale per compatibilità
    res.status(200).json({ 
      success: true, 
      message: 'Vote recorded successfully',
      data: result.data
    });

  } catch (error) {
    logger.error('Error in vote endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
