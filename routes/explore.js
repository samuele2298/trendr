'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// Helper function per calcolare lo score di una question
function calculateQuestionScore(questionId, votes) {
  const questionVotes = votes.filter(vote => vote.questionId === questionId);
  const totalVotes = questionVotes.length;
  
  if (totalVotes === 0) return 0;
  
  const now = new Date();
  let scoreSum = 0;
  
  questionVotes.forEach(vote => {
    const voteTime = new Date(vote.time);
    const hoursAgo = (now - voteTime) / (1000 * 60 * 60);
    const timeDecay = Math.max(0, 1 - (hoursAgo / 24));
    scoreSum += timeDecay;
  });
  
  const maxPossibleScore = totalVotes;
  return maxPossibleScore > 0 ? Math.min(1, scoreSum / maxPossibleScore) : 0;
}

// Helper function per generare testi automatici
function generateText(question, votes, score, type) {
  const percentage = Math.round(score * 100);
  const voteCount = votes;
  
  const templates = {
    trends: [
      `📈 Trending della settimana: "${question}" - ${percentage}% di consenso con ${voteCount} voti!`,
      `🔥 Hot topic: Solo il ${percentage}% è d'accordo su "${question}"`,
      `⚡ Dibattito acceso: "${question}" divide l'opinione (${percentage}%)`,
      `💬 Discussione calda: ${voteCount} persone hanno votato "${question}" con ${percentage}% di consenso`,
      `🚀 Trend settimanale: "${question}" raggiunge il ${percentage}% di approvazione`
    ],
    today: [
      `📊 Risultato del giorno: "${question}" - ${percentage}% dopo ${voteCount} voti oggi`,
      `⏰ Nelle ultime 24h: "${question}" ha ottenuto ${percentage}% di consenso`,
      `🎯 Focus oggi: Solo il ${percentage}% supporta "${question}"`,
      `📈 Oggi si parla di: "${question}" (${percentage}% favorevoli)`,
      `💡 Insight giornaliero: "${question}" divide con ${percentage}% di sì`
    ]
  };
  
  const templateArray = templates[type] || templates.trends;
  return templateArray[Math.floor(Math.random() * templateArray.length)];
}

// GET /trends - Top 3 questions dell'ultima settimana con score estremi
router.get('/trends', async (req, res, next) => {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const questions = db.read('questions');
    const allVotes = db.read('votes');
    
    // Filtra voti dell'ultima settimana
    const weekVotes = allVotes.filter(vote => {
      const voteDate = new Date(vote.time);
      return voteDate >= oneWeekAgo;
    });
    
    // Calcola score per ogni question
    const questionStats = questions.map(question => {
      const questionVotes = weekVotes.filter(vote => vote.questionId === question.id);
      const score = calculateQuestionScore(question.id, weekVotes);
      
      return {
        question,
        votes: questionVotes.length,
        score: Math.round(score * 100) / 100
      };
    });
    
    // Filtra solo questions con voti e ordina per score più estremi (vicini a 0 o 1)
    const trendingQuestions = questionStats
      .filter(item => item.votes > 0)
      .sort((a, b) => {
        // Ordina per distanza da 0.5 (più estremo = più lontano da 0.5)
        const extremeA = Math.abs(a.score - 0.5);
        const extremeB = Math.abs(b.score - 0.5);
        return extremeB - extremeA;
      })
      .slice(0, 3);
    
    // Crea highlights
    const highlights = trendingQuestions.map(item => ({
      qid: item.question.id,
      text: generateText(item.question.question, item.votes, item.score, 'trends'),
      tagsIds: item.question.tags,
      votes: item.votes,
      score: item.score
    }));
    
    res.status(200).json({
      success: true,
      data: highlights,
      meta: {
        period: 'last_week',
        totalAnalyzed: questions.length,
        withVotes: questionStats.filter(q => q.votes > 0).length
      }
    });
    
  } catch (error) {
    logger.error('getTrends:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /today - Top 3 questions delle ultime 24h con risultati estremi
router.get('/today', async (req, res, next) => {
  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const questions = db.read('questions');
    const allVotes = db.read('votes');
    
    // Filtra voti delle ultime 24h
    const todayVotes = allVotes.filter(vote => {
      const voteDate = new Date(vote.time);
      return voteDate >= twentyFourHoursAgo;
    });
    
    // Calcola score per ogni question
    const questionStats = questions.map(question => {
      const questionVotes = todayVotes.filter(vote => vote.questionId === question.id);
      const score = calculateQuestionScore(question.id, todayVotes);
      
      return {
        question,
        votes: questionVotes.length,
        score: Math.round(score * 100) / 100
      };
    });
    
    // Filtra solo questions con voti oggi e ordina per risultati più estremi
    const todayQuestions = questionStats
      .filter(item => item.votes > 0)
      .sort((a, b) => {
        // Ordina per distanza da 0.5 (più estremo = più lontano da 0.5)
        const extremeA = Math.abs(a.score - 0.5);
        const extremeB = Math.abs(b.score - 0.5);
        return extremeB - extremeA;
      })
      .slice(0, 3);
    
    // Crea highlights
    const highlights = todayQuestions.map(item => ({
      qid: item.question.id,
      text: generateText(item.question.question, item.votes, item.score, 'today'),
      tagsIds: item.question.tags,
      votes: item.votes,
      score: item.score
    }));
    
    res.status(200).json({
      success: true,
      data: highlights,
      meta: {
        period: 'last_24h',
        totalAnalyzed: questions.length,
        withVotesToday: questionStats.filter(q => q.votes > 0).length
      }
    });
    
  } catch (error) {
    logger.error('getToday:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;