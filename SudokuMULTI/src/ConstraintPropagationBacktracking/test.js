const axios = require('axios');

// Load the grid from your JSON file. Make sure grid.json is in the same directory.
const grid = require('../16x1625%.json');
axios.post('http://localhost:3000/solve', { board: grid })
  .then(response => {
    console.log('Response:', response.data);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });