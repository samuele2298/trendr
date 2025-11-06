'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// POST vota una question
router.post('/', async (req, res, next) => {
  try {
    const { questionId, user } = req.body;

    // Validazione input
    if (!questionId) {
      return res.status(400).json({
        success: false,
        error: 'questionId is required'
      });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'user is required'
      });
    }

    // Validazione struttura user
    let userObj;
    try {
      userObj = typeof user === 'string' ? JSON.parse(user) : user;
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user JSON format'
      });
    }

    // Validazione campi obbligatori user
    if (!userObj.id) {
      return res.status(400).json({
        success: false,
        error: 'user.id is required'
      });
    }

    // Verifica che la question esista
    const question = db.findById('questions', questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    // Controlla se l'utente ha già votato per questa question
    const existingVotes = db.find('votes', { questionId });
    const userAlreadyVoted = existingVotes.some(vote => {
      const voteUser = JSON.parse(vote.user);
      return voteUser.id === userObj.id;
    });

    if (userAlreadyVoted) {
      return res.status(409).json({
        success: false,
        error: 'User has already voted for this question'
      });
    }

    // Validazione opzionale dei campi user se presenti
    if (userObj.gender) {
      const genders = db.read('gender');
      const validGender = genders.find(g => g.id === userObj.gender);
      if (!validGender) {
        return res.status(400).json({
          success: false,
          error: 'Invalid gender ID'
        });
      }
    }

    if (userObj.interestsIds && Array.isArray(userObj.interestsIds)) {
      const interests = db.read('interests');
      const validInterests = userObj.interestsIds.every(interestId => 
        interests.find(i => i.id === interestId)
      );
      if (!validInterests) {
        return res.status(400).json({
          success: false,
          error: 'Invalid interest IDs'
        });
      }
    }

    if (userObj.sectorName) {
      const sectors = db.read('sector');
      const validSector = sectors.find(s => s.id === userObj.sectorName);
      if (!validSector) {
        return res.status(400).json({
          success: false,
          error: 'Invalid sector ID'
        });
      }
    }

    // Crea il nuovo voto
    const newVote = {
      questionId,
      user: JSON.stringify(userObj),
      time: new Date().toISOString()
    };

    // Aggiunge il voto
    const success = db.add('votes', newVote);
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save vote'
      });
    }

    // Ritorna conferma
    res.status(200).json({ 
      success: true, 
      message: 'Vote recorded successfully',
      data: {
        questionId,
        userId: userObj.id,
        timestamp: newVote.time
      }
    });

  } catch (error) {
    logger.error('Error in vote endpoint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET total votes per una question
router.get('/total/:qid', async (req, res, next) => {
  try {
    const qid = req.params.qid;
    
    const votes = db.find('votes', { questionId: qid });
    const totalVotes = votes.length;

    res.status(200).json({ 
      success: true, 
      data: { 
        questionId: qid,
        totalVotes 
      }
    });
  } catch (error) {
    logger.error('getTotalVotes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET score per una question
router.get('/score/:qid', async (req, res, next) => {
  try {
    const qid = req.params.qid;
    
    const votes = db.find('votes', { questionId: qid });
    const totalVotes = votes.length;
    
    // Calcola score basato su numero di voti e recency
    // Più voti recenti = score più alto
    const now = new Date();
    let score = 0;
    
    votes.forEach(vote => {
      const voteTime = new Date(vote.time);
      const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
      
      // Score decresce con il tempo: voti recenti valgono di più
      const timeDecay = Math.max(0, 1 - (hoursAgo / 24)); // Decade completamente dopo 24 ore
      score += timeDecay;
    });
    
    // Normalizza score tra 0 e 1
    const maxPossibleScore = totalVotes;
    const normalizedScore = maxPossibleScore > 0 ? Math.min(1, score / maxPossibleScore) : 0;

    res.status(200).json({ 
      success: true, 
      data: { 
        questionId: qid,
        score: Math.round(normalizedScore * 100) / 100, // Arrotonda a 2 decimali
        totalVotes
      }
    });
  } catch (error) {
    logger.error('getScore:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
