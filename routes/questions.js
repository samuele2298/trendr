'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// GET tutte le questions con paginazione
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const allQuestions = db.read('questions');
    const total = allQuestions.length;

    // Applica paginazione
    const questions = allQuestions.slice(offset, offset + limit);

    // Aggiunge informazioni sui tags per ogni question
    const tags = db.read('tags');
    const allVotes = db.read('votes');
    
    const questionsWithTags = questions.map(question => {
      const questionTags = question.tags.map(tagId => 
        tags.find(tag => tag.id === tagId)
      ).filter(tag => tag !== undefined);

      // Calcola totalVotes e score per ogni question
      const votes = allVotes.filter(vote => vote.questionId === question.id);
      const totalVotes = votes.length;
      
      // Calcola score normalizzato (0-1) basato su recency
      const now = new Date();
      let scoreSum = 0;
      
      votes.forEach(vote => {
        const voteTime = new Date(vote.time);
        const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
        
        // Score decresce con il tempo: voti recenti valgono di più
        const timeDecay = Math.max(0, 1 - (hoursAgo / 24)); // Decade completamente dopo 24 ore
        scoreSum += timeDecay;
      });
      
      // Normalizza score tra 0 e 1
      const maxPossibleScore = totalVotes;
      const normalizedScore = maxPossibleScore > 0 ? Math.min(1, scoreSum / maxPossibleScore) : 0;

      return {
        id: parseInt(question.id),
        question: question.question,
        imageUrl: question.media || '',
        score: Math.round(normalizedScore * 100) / 100,
        tagsIds: question.tags,
        totalVotes,
      };
    });

    res.status(200).json({ 
      success: true, 
      data: questionsWithTags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: offset + limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    logger.error('getQuestions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET search questions by query
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query parameter "q" is required and must be a non-empty string' 
      });
    }

    const searchTerm = query.trim().toLowerCase();
    const allQuestions = db.read('questions');
    
    // Filtra questions che contengono la query nel testo della domanda
    const matchingQuestions = allQuestions.filter(question => 
      question.question.toLowerCase().includes(searchTerm)
    );

    // Restituisce solo gli ID e i testi delle domande
    const searchResults = matchingQuestions.map(question => ({
      qId: parseInt(question.id),
      question: question.question
    }));

    res.status(200).json({ 
      success: true, 
      data: searchResults,
      meta: {
        query: query.trim(),
        totalResults: searchResults.length,
        totalQuestions: allQuestions.length
      }
    });
  } catch (error) {
    logger.error('searchQuestions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET singola question completa per ID
router.get('/:id', async (req, res) => {
  try {
    const qid = req.params.id;
    
    const question = db.findById('questions', qid);
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    // Aggiunge informazioni sui tags
    const tags = db.read('tags');
    const questionTags = question.tags.map(tagId => 
      tags.find(tag => tag.id === tagId)
    ).filter(tag => tag !== undefined);

    // Aggiunge statistiche sui voti
    const votes = db.find('votes', { questionId: qid });
    const totalVotes = votes.length;

    // Calcola score normalizzato (0-1) basato su recency
    const now = new Date();
    let scoreSum = 0;
    
    votes.forEach(vote => {
      const voteTime = new Date(vote.time);
      const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
      
      // Score decresce con il tempo: voti recenti valgono di più
      const timeDecay = Math.max(0, 1 - (hoursAgo / 24)); // Decade completamente dopo 24 ore
      scoreSum += timeDecay;
    });
    
    // Normalizza score tra 0 e 1
    const maxPossibleScore = totalVotes;
    const normalizedScore = maxPossibleScore > 0 ? Math.min(1, scoreSum / maxPossibleScore) : 0;

    const completeQuestion = {
      qId: parseInt(question.id),
      question: question.question,
      imageUrl: question.media || '',
      score: Math.round(normalizedScore * 100) / 100,
      tagsIds: question.tags,
      totalVotes,
      // Per GET base, restituisce arrays vuoti - usare POST per statistiche dettagliate
      all: [],
      thirtyDays: [],
      sixMonths: [],
      oneYear: []
    };

    res.status(200).json({ success: true, data: completeQuestion });
  } catch (error) {
    logger.error('getQuestion:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST statistics per una specific question
router.post('/:id', async (req, res) => {
  try {
    const qid = req.params.id;
    const { user } = req.body;

    const question = db.findById('questions', qid);
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    // Recupera tutti i voti per questa question
    const allVotes = db.find('votes', { questionId: qid });
    
    // Helper function per calcolare statistiche
    function calculateStats(votes, title, description) {
      const totalVotes = votes.length;
      if (totalVotes === 0) {
        return {
          title,
          description,
          score: 0.0,
          votes: 0
        };
      }

      // Calcola score basato su recency
      const now = new Date();
      let scoreSum = 0;
      
      votes.forEach(vote => {
        const voteTime = new Date(vote.time);
        const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
        const timeDecay = Math.max(0, 1 - (hoursAgo / 24));
        scoreSum += timeDecay;
      });
      
      const normalizedScore = totalVotes > 0 ? Math.min(1, scoreSum / totalVotes) : 0;
      
      return {
        title,
        description,
        score: Math.round(normalizedScore * 100) / 100,
        votes: totalVotes
      };
    }

    // Helper function per filtrare voti per periodo
    function filterByPeriod(votes, days) {
      if (days === 'all') return votes;
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      return votes.filter(vote => {
        const voteTime = new Date(vote.time);
        return voteTime >= cutoffDate;
      });
    }

    // Helper function per calcolare stats per tutti i periodi
    function calculateAllPeriods(filteredVotes, title, description) {
      return {
        all: calculateStats(filterByPeriod(filteredVotes, 'all'), title, description),
        thirtyDays: calculateStats(filterByPeriod(filteredVotes, 30), title, description),
        sixMonths: calculateStats(filterByPeriod(filteredVotes, 180), title, description),
        oneYear: calculateStats(filterByPeriod(filteredVotes, 365), title, description)
      };
    }

    // Parse user data da ogni voto
    const votesWithParsedUsers = allVotes.map(vote => {
      try {
        const parsedUser = JSON.parse(vote.user);
        return { ...vote, parsedUser };
      } catch (e) {
        return { ...vote, parsedUser: { id: 'unknown' } };
      }
    });

    const stats = [];

    // 1. STATISTICHE GLOBALI (sempre presenti)
    const worldStats = calculateAllPeriods(votesWithParsedUsers, "Mondo", "Statistiche globali");
    stats.push(worldStats);

    // Se non è stato passato un user o non ha ID, restituisce solo le statistiche globali
    if (!user || !user.id) {
      const questionVotes = allVotes.length;
      const now = new Date();
      let questionScoreSum = 0;
      
      allVotes.forEach(vote => {
        const voteTime = new Date(vote.time);
        const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
        const timeDecay = Math.max(0, 1 - (hoursAgo / 24));
        questionScoreSum += timeDecay;
      });
      
      const questionScore = questionVotes > 0 ? Math.min(1, questionScoreSum / questionVotes) : 0;

      const questionStats = {
        qId: parseInt(question.id),
        question: question.question,
        imageUrl: question.media || '',
        score: Math.round(questionScore * 100) / 100,
        tagsIds: question.tags,
        totalVotes: questionVotes,
        all: stats.map(stat => stat.all),
        thirtyDays: stats.map(stat => stat.thirtyDays),
        sixMonths: stats.map(stat => stat.sixMonths),
        oneYear: stats.map(stat => stat.oneYear)
      };

      return res.status(200).json({ success: true, data: questionStats });
    }

    // 2. STATISTICHE PER LUOGO (solo se user ha cityName)
    if (user.cityName) {
      const sameStateVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.cityName === user.cityName
      );
      const stateStats = calculateAllPeriods(sameStateVotes, "Tua Zona", "Utenti della tua stessa area geografica");
      stats.push(stateStats);
    }

    // 3. STATISTICHE PER ETÀ (solo se user ha rangeAge)
    if (user.rangeAge) {
      const sameAgeVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.rangeAge === user.rangeAge
      );
      const ageStats = calculateAllPeriods(sameAgeVotes, "Tua Età", `Utenti della fascia ${user.rangeAge} anni`);
      stats.push(ageStats);
    }

    // 4. STATISTICHE PER SETTORE (solo se user ha sectorName)
    if (user.sectorName) {
      const sameSectorVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.sectorName === user.sectorName
      );
      const sectorStats = calculateAllPeriods(sameSectorVotes, "Tuo Settore", "Utenti del tuo stesso settore lavorativo");
      stats.push(sectorStats);
    }

    // 5. STATISTICHE PER GENDER (solo se user ha gender)
    if (user.gender) {
      const sameGenderVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.gender === user.gender
      );
      const genderStats = calculateAllPeriods(sameGenderVotes, "Tuo Genere", "Utenti del tuo stesso genere");
      stats.push(genderStats);
    }

    // 6. STATISTICHE PER INTERESSI (solo se user ha interestsIds)
    if (user.interestsIds && Array.isArray(user.interestsIds) && user.interestsIds.length > 0) {
      const sameInterestsVotes = votesWithParsedUsers.filter(vote => {
        if (!vote.parsedUser.interestsIds) return false;
        
        const userInterests = Array.isArray(vote.parsedUser.interestsIds) 
          ? vote.parsedUser.interestsIds 
          : [];
          
        // Controlla se ha almeno un interesse in comune
        return user.interestsIds.some(interest => 
          userInterests.includes(interest)
        );
      });
      const interestsStats = calculateAllPeriods(sameInterestsVotes, "Tuoi Interessi", "Utenti con interessi simili ai tuoi");
      stats.push(interestsStats);
    }

    // Calcola score e totalVotes per la question
    const questionVotes = allVotes.length;
    const now = new Date();
    let questionScoreSum = 0;
    
    allVotes.forEach(vote => {
      const voteTime = new Date(vote.time);
      const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
      const timeDecay = Math.max(0, 1 - (hoursAgo / 24));
      questionScoreSum += timeDecay;
    });
    
    const questionScore = questionVotes > 0 ? Math.min(1, questionScoreSum / questionVotes) : 0;

    // Aggiunge informazioni sui tags
    const tags = db.read('tags');
    const questionTags = question.tags.map(tagId => 
      tags.find(tag => tag.id === tagId)
    ).filter(tag => tag !== undefined);

    const questionStats = {
      qId: parseInt(question.id),
      question: question.question,
      imageUrl: question.media || '',
      score: Math.round(questionScore * 100) / 100,
      tagsIds: question.tags,
      totalVotes: questionVotes,
      // Restituisce le prime statistiche disponibili per ogni periodo
      all: stats.map(stat => stat.all),
      thirtyDays: stats.map(stat => stat.thirtyDays),
      sixMonths: stats.map(stat => stat.sixMonths),
      oneYear: stats.map(stat => stat.oneYear)
    };

    res.status(200).json({ success: true, data: questionStats });
  } catch (error) {
    logger.error('getQuestionStats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;