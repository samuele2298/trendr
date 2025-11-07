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
      const votes = allVotes.filter(vote => vote.questionId == question.id);
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
        media: question.media || '',
        score: Math.round(normalizedScore * 100) / 100,
        tags: question.tags,
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
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    // Supporta tagIds come CSV: ?tagIds=1,2,3 oppure ?tags=1,2,3
    const tagIdsRaw = typeof req.query.tagIds === 'string' ? req.query.tagIds : (typeof req.query.tags === 'string' ? req.query.tags : '');
    const allFlag = req.query.all === 'true' || req.query.all === '1'; // se true richiede che la question contenga tutti i tag

    // Se non è passato né q né tagIds => 400
    if ((!query || query.length === 0) && (!tagIdsRaw || tagIdsRaw.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Provide either query parameter "q" or "tagIds" (CSV)'
      });
    }

    const allQuestions = db.read('questions') || [];

    // Preload votes and tags to compute totals/scores
    const allVotes = db.read('votes') || [];
    const tags = db.read('tags') || [];

    let results = [];

    // Search by text if q provided
    if (query && query.length > 0) {
      const searchTerm = query.toLowerCase();
      const matchingQuestions = allQuestions.filter(question => {
        const text = (question.question || '').toString().toLowerCase();
        return text.includes(searchTerm);
      });

      results = matchingQuestions;
    }

    // Search by tags if tagIds provided; parse CSV
    if (tagIdsRaw && tagIdsRaw.trim().length > 0) {
      const tagIds = tagIdsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0).map(String);

      const byTags = allQuestions.filter(question => {
        const qTags = Array.isArray(question.tags) ? question.tags.map(String) : [];
        if (allFlag) {
          // require all tags present
          return tagIds.every(t => qTags.includes(t));
        }
        // default: match any (OR)
        return tagIds.some(t => qTags.includes(t));
      });

      // If we already had text-based results, intersect them with byTags
      if (results.length > 0) {
        const byTagsIds = new Set(byTags.map(q => String(q.id)));
        results = results.filter(q => byTagsIds.has(String(q.id)));
      } else {
        results = byTags;
      }
    }
    
    // For each found question compute votes/score and include all stored fields
    const now = new Date();
    const searchResults = results.map(question => {
      const questionTags = Array.isArray(question.tags) ? question.tags.map(tagId =>
        tags.find(tag => tag.id === tagId)
      ).filter(tag => tag !== undefined) : [];

      const votes = allVotes.filter(vote => vote.questionId == question.id);
      const totalVotes = votes.length;

      // compute recency-based score
      let scoreSum = 0;
      votes.forEach(vote => {
        const voteTime = new Date(vote.time);
        const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
        const timeDecay = Math.max(0, 1 - (hoursAgo / 24));
        scoreSum += timeDecay;
      });
      const normalizedScore = totalVotes > 0 ? Math.min(1, scoreSum / totalVotes) : 0;

      // Return the full question object plus computed fields
      return Object.assign({}, question, {
        id: parseInt(question.id),
        score: Math.round(normalizedScore * 100) / 100,
        totalVotes,
        tags: questionTags
      });
    });

    res.status(200).json({
      success: true,
      data: searchResults,
      meta: {
        query: query || null,
        tagIds: tagIdsRaw || null,
        all: allFlag,
        totalResults: searchResults.length,
        totalQuestions: allQuestions.length
      }
    });
  } catch (error) {
    logger.error('searchQuestions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST statistics per una specific question
router.post('/:id', async (req, res) => {
  try {
    const qid = req.params.id;
    const user  = req.body;

    const question = db.findById('questions', qid);
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const dbVotes = await db.find('votes');
    const allVotes = dbVotes.filter(vote => vote.questionId == qid);
    
    // Helper function per calcolare statistiche
    function calculateStats(votes, title, description, type) {
      const totalVotes = votes.length;
      if (totalVotes === 0) {
        return {
          title,
          description,
          type,
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
        type,
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
    function calculateAllPeriods(filteredVotes, title, description, type) {
      return {
        all: calculateStats(filterByPeriod(filteredVotes, 'all'), title, description, type),
        thirtyDays: calculateStats(filterByPeriod(filteredVotes, 30), title, description, type),
        sixMonths: calculateStats(filterByPeriod(filteredVotes, 180), title, description, type),
        oneYear: calculateStats(filterByPeriod(filteredVotes, 365), title, description, type)
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
    const worldStats = calculateAllPeriods(votesWithParsedUsers, "Mondo", "Statistiche globali", "location");
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

    // 2. STATISTICHE PER LUOGO (solo se user ha location)
    if (user.location && user.location !== '') {
      const sameStateVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.location === user.location
      );

      // Proviamo a risolvere il nome della location dal DB `cities`
      let locationTitle = "Tua Zona";
      let locationDescription = "Utenti della tua stessa area geografica";
      try {
        const city = db.findById('cities', user.location);
        if (city) {
          // city può avere campi `nome` o `name`
          const cityName = city.nome || city.name || city.title || String(user.location);
          locationTitle = cityName;
          locationDescription = `Utenti di ${cityName}`;
        }
      } catch (e) {
        // fallback: lascia i testi di default
      }

      const stateStats = calculateAllPeriods(sameStateVotes, locationTitle, locationDescription, "location");
      stats.push(stateStats);
    }

    // 3. STATISTICHE PER ETÀ (solo se user ha age)
    if (user.age && user.age !== '') {
      const sameAgeVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.age === user.age
      );

      // Proviamo a risolvere il nome della fascia dagli ages
      let ageTitle = "Tua Età";
      let ageDescription = `Utenti della fascia ${user.age} anni`;
      try {
        const ageEntry = db.findById('ages', user.age);
        if (ageEntry && (ageEntry.name || ageEntry.nome)) {
          const ageName = ageEntry.name || ageEntry.nome;
          ageTitle = `Fascia ${ageName}`;
          ageDescription = `Utenti della fascia ${ageName}`;
        }
      } catch (e) {}

      const ageStats = calculateAllPeriods(sameAgeVotes, ageTitle, ageDescription, "age");
      stats.push(ageStats);
    }

    // 4. STATISTICHE PER SETTORE (solo se user ha sectorName)
    if (user.sectorName && user.sectorName !== '') {
      const sameSectorVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.sectorName === user.sectorName
      );

      // Se sectorName è un id, risolviamo dal DB `sectors`
      let sectorTitle = "Tuo Settore";
      let sectorDescription = "Utenti del tuo stesso settore lavorativo";
      try {
        const sectorEntry = db.findById('sectors', user.sectorName);
        if (sectorEntry && (sectorEntry.name || sectorEntry.title)) {
          const sectorName = sectorEntry.name || sectorEntry.title;
          sectorTitle = sectorName;
          sectorDescription = `Utenti di ${sectorName}`;
        }
      } catch (e) {}

      const sectorStats = calculateAllPeriods(sameSectorVotes, sectorTitle, sectorDescription, "sector");
      stats.push(sectorStats);
    }

    // 5. STATISTICHE PER GENDER (solo se user ha gender)
    if (user.gender && user.gender !== '') {
      const sameGenderVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.gender === user.gender
      );

      // Risolviamo il nome del genere dal DB `gender`
      let genderTitle = "Tuo Genere";
      let genderDescription = "Utenti del tuo stesso genere";
      try {
        const genderEntry = db.findById('gender', user.gender);
        if (genderEntry && (genderEntry.name || genderEntry.title)) {
          const genderName = genderEntry.name || genderEntry.title;
          genderTitle = genderName;
          genderDescription = `Utenti di genere ${genderName}`;
        }
      } catch (e) {}

      const genderStats = calculateAllPeriods(sameGenderVotes, genderTitle, genderDescription, "gender");
      stats.push(genderStats);
    }

    // 6. STATISTICHE PER INTERESSI (solo se user ha interestsIds)
    if (user.interests && Array.isArray(user.interests) && user.interests.length > 0) {
      const sameInterestsVotes = votesWithParsedUsers.filter(vote => {
        if (!vote.parsedUser.interests) return false;

        const userInterests = Array.isArray(vote.parsedUser.interests) 
          ? vote.parsedUser.interests 
          : [];
          
        // Controlla se ha almeno un interesse in comune
        return user.interests.some(interest => 
          userInterests.includes(interest)
        );
      });

      // Se è passato un solo interesse (id), risolviamo il suo nome dal DB `interests`
      let interestsTitle = "Tuoi Interessi";
      let interestsDescription = "Utenti con interessi simili ai tuoi";
      try {
        if (user.interests.length === 1) {
          const interestEntry = db.findById('interests', user.interests[0]);
          if (interestEntry && (interestEntry.name || interestEntry.title)) {
            const interestName = interestEntry.name || interestEntry.title;
            interestsTitle = interestName;
            interestsDescription = `Utenti interessati a ${interestName}`;
          }
        } else {
          // Se sono più di uno, proviamo a risolvere alcuni nomi per la descrizione
          const names = user.interests.slice(0,3).map(id => {
            const e = db.findById('interests', id);
            return e ? (e.name || e.title) : null;
          }).filter(Boolean);
          if (names.length > 0) {
            interestsDescription = `Utenti interessati a ${names.join(', ')}`;
          }
        }
      } catch (e) {}

      const interestsStats = calculateAllPeriods(sameInterestsVotes, interestsTitle, interestsDescription, "interests");
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