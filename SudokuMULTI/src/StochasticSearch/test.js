// test25x25.js
const axios = require('axios');

// Load the grid from your JSON file. Make sure grid.json is in the same directory.
const grid = require('/Users/harshsharma/Desktop/Sudoku/SudokuMULTI/StochasticSearch/solution.json');

axios.post('http://localhost:3010/solve', { board: grid })
  .then(response => {
    console.log('Response:', response.data);
  })
  .catch(error => {
    console.error('Full error:', error);  // Log the full error object
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  });