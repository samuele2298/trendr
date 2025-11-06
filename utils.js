'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const path = require('path');
const logger = require('./logger');

const formatDate = (date) => {
  // Ensure the date is valid
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid Date');
  }
  // Extract the year, month, and day
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(date.getDate()).padStart(2, '0'); // Ensure two digits

  return `${year}-${month}-${day}`; // Return formatted date string
};

const sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            return resolve();
        }, ms);
    });
};

module.exports = {
  formatDate,
  sleep
};