'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../logger');
const db = require('../db');

// Helper function per calcolare lo score di una question basato su consenso
function calculateQuestionScore(questionId, votes) {
  const questionVotes = votes.filter(vote => vote.questionId == questionId);
  const totalVotes = questionVotes.length;
  
  if (totalVotes === 0) return 0;
  
  // Calcola score basato su consenso (positivi vs negativi)
  const positives = questionVotes.filter(v => v.vote === 1).length;
  const negatives = questionVotes.filter(v => v.vote === 0).length;
  const consensusScore = ((positives - negatives) / totalVotes + 1) / 2;
  
  return consensusScore;
}

// Helper function per generare testi automatici
function generateText(question, votes, score, type) {
  const percentage = Math.round(score * 100);
  const voteCount = votes;
  
  const templates = {
    trends: [
      `📈 Weekly trending: "${question}" - ${percentage}% consensus with ${voteCount} votes!`,
      `🔥 Hot topic: Only ${percentage}% agree on "${question}"`,
      `⚡ Heated debate: "${question}" splits opinions (${percentage}%)`,
      `💬 Hot discussion: ${voteCount} people voted on "${question}" with ${percentage}% consensus`,
      `🚀 Weekly trend: "${question}" reaches ${percentage}% approval`,
      `🌟 Trending now: "${question}" has ${percentage}% agreement from ${voteCount} voters`,
      `💥 Viral question: "${question}" sparks debate with ${percentage}% consensus`,
      `📊 This week's buzz: "${question}" - ${percentage}% approval rate`,
      `🎯 Trending topic: ${voteCount} votes on "${question}" show ${percentage}% agreement`,
      `🔥 Breaking: "${question}" trending with ${percentage}% consensus`
    ],
    today: [
      `📊 Today's result: "${question}" - ${percentage}% after ${voteCount} votes today`,
      `⏰ In the last 24h: "${question}" got ${percentage}% consensus`,
      `🎯 Today's focus: Only ${percentage}% support "${question}"`,
      `📈 Today's talk: "${question}" (${percentage}% in favor)`,
      `💡 Daily insight: "${question}" divides with ${percentage}% yes`,
      `🌅 Morning buzz: "${question}" has ${percentage}% agreement today`,
      `⚡ Today's hot take: ${voteCount} votes on "${question}" - ${percentage}% consensus`,
      `📈 Daily trend: "${question}" reaches ${percentage}% approval in 24h`,
      `🎯 24h highlight: "${question}" with ${percentage}% agreement`,
      `💬 Today's debate: ${voteCount} people weighed in on "${question}" (${percentage}%)`
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

    const queryQ = `
      SELECT
          q.id,
          q."Tquestion_question" as question,
          q."Tquestion_media" as media,
          array_agg(qt."Ttag_id") as tags
      FROM "Tquestion" q
      LEFT JOIN "Tquestion_tag" qt ON q.id = qt."Tquestion_id"
      GROUP BY q.id, q."Tquestion_question", q."Tquestion_media"
      ORDER BY q.id;
    `;
    const questions = await db.any(queryQ);
        
    const queryV = `
      SELECT
          "Tvote_Tquestion_id" qid,
          "Tvote_vote" vote,
          "Tvote_createtime" time
      FROM "Tvote"
      WHERE "Tvote_createtime" >= $1
      ORDER BY "Tvote_Tquestion_id";
    `;
    const allVotes = await db.any(queryV, [oneWeekAgo]);
    
    // Filtra voti dell'ultima settimana
    const weekVotes = allVotes.filter(vote => {
      const voteDate = new Date(vote.time);
      return voteDate >= oneWeekAgo;
    });
    
    // Calcola score per ogni question
    const questionStats = questions.map(question => {
      const questionVotes = weekVotes.filter(vote => vote.qid == question.id);
      const score = calculateQuestionScore(question.id, weekVotes);
      
      return {
        question,
        votes: questionVotes.length,
        score: Math.round(score * 100) / 100
      };
    });
    
    // Filtra solo questions con voti e ordina per numero di voti (più votate prima)
    // Tie-breaker: score più alto prima
    const trendingQuestions = questionStats
      .filter(item => item.votes > 0)
      .sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return b.score - a.score;
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
    
    const queryQ = `
      SELECT
          q.id,
          q."Tquestion_question" as question,
          q."Tquestion_media" as media,
          array_agg(qt."Ttag_id") as tags
      FROM "Tquestion" q
      LEFT JOIN "Tquestion_tag" qt ON q.id = qt."Tquestion_id"
      GROUP BY q.id, q."Tquestion_question", q."Tquestion_media"
      ORDER BY q.id;
    `;
    const questions = await db.any(queryQ);
        
    const queryV = `
      SELECT
          "Tvote_Tquestion_id" qid,
          "Tvote_vote" vote,
          "Tvote_createtime" time
      FROM "Tvote"
      WHERE "Tvote_createtime" >= $1
      ORDER BY "Tvote_Tquestion_id";
    `;
    const allVotes = await db.any(queryV, [twentyFourHoursAgo]);
    
    // Filtra voti delle ultime 24h
    const todayVotes = allVotes.filter(vote => {
      const voteDate = new Date(vote.time);
      return voteDate >= twentyFourHoursAgo;
    });
    
    // Calcola score per ogni question
    const questionStats = questions.map(question => {
      const questionVotes = todayVotes.filter(vote => vote.qid == question.id);
      const score = calculateQuestionScore(question.id, todayVotes);
      
      return {
        question,
        votes: questionVotes.length,
        score: Math.round(score * 100) / 100
      };
    });
    
    // Filtra solo questions con voti oggi e ordina per numero di voti (più votate prima)
    // Tie-breaker: score più alto prima
    const todayQuestions = questionStats
      .filter(item => item.votes > 0)
      .sort((a, b) => {
        if (b.votes !== a.votes) return b.votes - a.votes;
        return b.score - a.score;
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