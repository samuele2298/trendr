'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// POST: elenco dei comuni per dropdown (ricerca via body)
router.post('/', async (req, res) => {
  try {
    // Body 'q' per ricerca (se vuoto => tutti). 'limit' opzionale, default 50, max 50
    const qRaw = typeof req.body.q === 'string' ? req.body.q.trim() : '';
    const q = qRaw.toLowerCase();
    let limit = parseInt(req.body.limit, 10) || 50;
    if (isNaN(limit) || limit <= 0) limit = 50;
    if (limit > 50) limit = 50;

    // Carica file cities.json dalla cartella principale
    const filePath = path.join(__dirname, '..', 'public', 'cities.json');
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const cities = JSON.parse(rawData);

    // Funzione di matching: cerca in name, admin2, country o id
    const matches = cities.filter(c => {
      if (!q) return true; // se q è vuoto, includi tutti
      const name = (c.name || '').toString().toLowerCase();
      return name.includes(q);
    });

    // Mappa e ordina per nome, poi limita
    const citiesDropdown = matches
      .map(c => ({
        name: c.name,      // nome comune
        country: c.country,      // nome nazione
        id: c.id.toString(),          // codice citta
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);

    res.status(200).json({ success: true, data: citiesDropdown });

  } catch (error) {
    logger.error('postCities:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET: comune per codice ISTAT
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Carica file cities.json
    const filePath = path.join(__dirname, '..', 'public', 'cities.json');
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const cities = JSON.parse(rawData);

    // Trova il comune corrispondente al codice ISTAT
    const city = cities.find(c => c.id == id);

    if (!city) {
      return res.status(404).json({ success: false, error: 'City not found' });
    }

    // Restituisci solo il nome
    res.status(200).json({ success: true, data: city.name });

  } catch (error) {
    logger.error('getCityById:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;