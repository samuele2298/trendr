'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// POST vota una question
router.post('/', async (req, res, next) => {
  try {
    const { questionId } = req.body;
    let { user } = req.body;
    const batch = req.body.votes; // optional array of votes

    // Helper to process one vote item { questionId, user }
    const processVote = (voteItem) => {
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
        const q = db.findById('questions', qId);
        if (!q) 
          return { success: false, error: 'Question not found', questionId: qId };

        // Duplicate check for this question
        const existing = db.find('votes', { questionId: qId });
        const already = existing.some(v => {
          try { const vu = JSON.parse(v.user); return vu.id === uObj.id; } catch (e) { return false; }
        });
        if (already) 
          return { success: false, error: 'User has already voted for this question', questionId: qId, userId: uObj.id };

        // Validate/clean optional fields
        // gender
        if (uObj.gender) {
          const genders = db.read('gender');
          const validGender = genders.find(g => g.id === uObj.gender);
          if (!validGender) delete uObj.gender;
        }
        // interestsIds
        if (uObj.interests) {
          const interests = db.read('interests');
          if (!Array.isArray(uObj.interests)) {
            delete uObj.interests;
          } else {
            const filtered = uObj.interests.filter(id => interests.find(i => i.id === id));
            if (filtered.length === 0) delete uObj.interests; else uObj.interests = filtered;
          }
        }
        // sectorName
        if (uObj.sector) {
          const sectors = db.read('sectors');
          const validSector = sectors.find(s => s.id === uObj.sector);
          if (!validSector) delete uObj.sector;
        }
        // rangeAge
        if (uObj.age) {
          const ages = db.read('ages');
          const validAge = ages.find(a => a.id === uObj.age || a.name === uObj.age);
          if (!validAge) delete uObj.age;
        }

        // create new vote
        const newV = { questionId: qId, user: JSON.stringify(uObj), time: new Date().toISOString(), vote: vote };
        const ok = db.add('votes', newV);
        if (!ok) 
          return { success: false, error: 'Failed to save vote', questionId: qId };

        return { success: true, data: { questionId: qId, userId: uObj.id, timestamp: newV.time } };
      } catch (err) {
        return { success: false, error: err.message };
      }
    };

    // Se abbiamo un batch, processalo
    if (Array.isArray(batch)) {
      const results = batch.map(item => processVote(item));
      return res.status(200).json({ success: true, results });
    }

    // Altrimenti processa come singolo voto usando la stessa logica
    if (!questionId) {
      return res.status(400).json({ success: false, error: 'questionId is required' });
    }

    const result = processVote({ questionId, user });
    
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
