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

      // Calcola totalVotes e score per ogni question basato su consenso (positivi vs negativi)
      const votes = allVotes.filter(vote => vote.questionId == question.id);
      const totalVotes = votes.length;
      
      // Conta positivi (vote=1) e negativi (vote=0)
      const positives = votes.filter(v => v.vote === 1).length;
      const negatives = votes.filter(v => v.vote === 0).length;
      
      // Score basato su consenso: ((positives - negatives) / total + 1) / 2 -> 0 to 1
      const consensusScore = totalVotes > 0 ? ((positives - negatives) / totalVotes + 1) / 2 : 0;

      return {
        id: parseInt(question.id),
        question: question.question,
        media: question.media || '',
        score: Math.round(consensusScore * 100) / 100,
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

      // compute consensus-based score
      const positives = votes.filter(v => v.vote === 1).length;
      const negatives = votes.filter(v => v.vote === 0).length;
      const consensusScore = totalVotes > 0 ? ((positives - negatives) / totalVotes + 1) / 2 : 0;

      // Return the full question object plus computed fields
      return Object.assign({}, question, {
        id: parseInt(question.id),
        score: Math.round(consensusScore * 100) / 100,
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

      // Calcola score basato su consenso (positivi vs negativi)
      const positives = votes.filter(v => v.vote === 1).length;
      const negatives = votes.filter(v => v.vote === 0).length;
      const consensusScore = ((positives - negatives) / totalVotes + 1) / 2;
      
      return {
        title,
        description,
        type,
        score: Math.round(consensusScore * 100) / 100,
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
      const positives = allVotes.filter(v => v.vote === 1).length;
      const negatives = allVotes.filter(v => v.vote === 0).length;
      const consensusScore = questionVotes > 0 ? ((positives - negatives) / questionVotes + 1) / 2 : 0;

      // Filtra le statistiche che hanno meno di 10 voti totali
      const filteredStats = stats.filter(stat => stat.all.votes >= 10);

      const questionStats = {
        qId: parseInt(question.id),
        question: question.question,
        imageUrl: question.media || '',
        score: Math.round(consensusScore * 100) / 100,
        tagsIds: question.tags,
        totalVotes: questionVotes,
        all: filteredStats.map(stat => stat.all),
        thirtyDays: filteredStats.map(stat => stat.thirtyDays),
        sixMonths: filteredStats.map(stat => stat.sixMonths),
        oneYear: filteredStats.map(stat => stat.oneYear)
      };

      return res.status(200).json({ success: true, data: questionStats });
    }

    // 2. STATISTICHE PER LUOGO (solo se user ha location)
    if (user.location && user.location !== '') {
      const sameStateVotes = votesWithParsedUsers.filter(vote => 
        vote.parsedUser.location === user.location
      );

      // Proviamo a risolvere il nome della location dal DB `cities`
      let locationTitle = "Your Area";
      let locationDescription = "Users in your same geographic area";
      try {
        const city = db.findById('cities', user.location);
        if (city) {
          // city può avere campi `nome` o `name`
          const cityName = city.nome || city.name || city.title || String(user.location);
          locationTitle = cityName;
          locationDescription = `Users in the area of ${cityName}`;
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
      let ageTitle = "Your Age";
      let ageDescription = `Users in the age range ${user.age} years`;
      try {
        const ageEntry = db.findById('ages', user.age);
        if (ageEntry && (ageEntry.name || ageEntry.nome)) {
          const ageName = ageEntry.name || ageEntry.nome;
          ageTitle = `Range ${ageName}`;
          ageDescription = `Users del range ${ageName}`;
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
          sectorDescription = `Users in the sector ${sectorName}`;
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
      let genderTitle = "Your Gender";
      let genderDescription = "Users of your same gender";
      try {
        const genderEntry = db.findById('gender', user.gender);
        if (genderEntry && (genderEntry.name || genderEntry.title)) {
          const genderName = genderEntry.name || genderEntry.title;
          genderTitle = genderName;
          genderDescription = `Users of gender ${genderName}`;
        }
      } catch (e) {}

      const genderStats = calculateAllPeriods(sameGenderVotes, genderTitle, genderDescription, "gender");
      stats.push(genderStats);
    }

    // 6. STATISTICHE PER INTERESSI (per OGNI interesse con almeno 1 voto, ordina mettendo prima quelli dell'utente)
    {
      // Mappa: interestId -> lista voti che includono quell'interesse
      const interestVotesMap = new Map();
      votesWithParsedUsers.forEach(vote => {
        const ivals = Array.isArray(vote.parsedUser?.interests) ? vote.parsedUser.interests : [];
        ivals.forEach(rawId => {
          const id = String(rawId);
          if (!interestVotesMap.has(id)) interestVotesMap.set(id, []);
          interestVotesMap.get(id).push(vote);
        });
      });

      // Considera solo interessi che hanno almeno 1 voto
      const allInterestIds = Array.from(interestVotesMap.entries())
        .filter(([, arr]) => arr && arr.length > 0)
        .map(([id]) => id);

      if (allInterestIds.length > 0) {
        // Ordina: prima quelli dell'utente (se presenti), poi gli altri per numero di voti desc
        const userInterests = Array.isArray(user.interests) ? user.interests.map(String) : [];
        const userFirstIds = userInterests.filter(id => interestVotesMap.has(id));
        const otherIds = allInterestIds.filter(id => !userFirstIds.includes(id));
        otherIds.sort((a, b) => (interestVotesMap.get(b).length - interestVotesMap.get(a).length));
        const ordered = [...new Set([...userFirstIds, ...otherIds])];

        // Crea uno stats block per OGNI interesse
        ordered.forEach(interestId => {
          const filteredVotes = interestVotesMap.get(interestId) || [];
          // resolve name from DB
          let interestName = interestId;
          try {
            const entry = db.findById('interests', interestId);
            if (entry && (entry.name || entry.title)) interestName = entry.name || entry.title;
          } catch (e) {}

          const perInterestStats = calculateAllPeriods(
            filteredVotes,
            interestName,
            `Users interested in ${interestName}`,
            "interests"
          );
          stats.push(perInterestStats);
        });
      }
    }

    // Calcola score e totalVotes per la question
    const questionVotes = allVotes.length;
    const positives = allVotes.filter(v => v.vote === 1).length;
    const negatives = allVotes.filter(v => v.vote === 0).length;
    const consensusScore = questionVotes > 0 ? ((positives - negatives) / questionVotes + 1) / 2 : 0;

    // Aggiunge informazioni sui tags
    const tags = db.read('tags');
    const questionTags = question.tags.map(tagId => 
      tags.find(tag => tag.id === tagId)
    ).filter(tag => tag !== undefined);

    // Filtra le statistiche che hanno meno di 10 voti totali
    const filteredStats = stats.filter(stat => stat.all.votes >= 10);

    const questionStats = {
      qId: parseInt(question.id),
      question: question.question,
      imageUrl: question.media || '',
      score: Math.round(consensusScore * 100) / 100,
      tagsIds: question.tags,
      totalVotes: questionVotes,
      // Restituisce le prime statistiche disponibili per ogni periodo
      all: filteredStats.map(stat => stat.all),
      thirtyDays: filteredStats.map(stat => stat.thirtyDays),
      sixMonths: filteredStats.map(stat => stat.sixMonths),
      oneYear: filteredStats.map(stat => stat.oneYear)
    };

    res.status(200).json({ success: true, data: questionStats });
  } catch (error) {
    logger.error('getQuestionStats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;