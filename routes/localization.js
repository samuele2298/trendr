'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// GET: elenco dei comuni per dropdown
router.get('/', async (req, res) => {
  try {
    // Carica file cities.json dalla cartella principale
    const filePath = path.join(__dirname, '..', 'public', 'cities.json');
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const cities = JSON.parse(rawData);

    // Mappa solo i campi necessari
    const citiesDropdown = cities.map(c => ({
      nome: c.name,      // nome comune
      id: c.id,          // codice citta
      province: c.admin2, // sigla provincia
      country: c.country  // sigla nazione
    }));

    // Ordina alfabeticamente per nome
    citiesDropdown.sort((a, b) => a.nome.localeCompare(b.nome));

    res.status(200).json({ success: true, data: citiesDropdown });

  } catch (error) {
    logger.error('getCities:', error);
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
    const city = cities.find(c => c.id === id);

    if (!city) {
      return res.status(404).json({ success: false, error: 'Città non trovata' });
    }

    // Restituisci solo il nome
    res.status(200).json({ success: true, data: city.name });

  } catch (error) {
    logger.error('getCityById:', error);
  }
});

module.exports = router;