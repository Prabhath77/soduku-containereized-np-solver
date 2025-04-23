// test25x25.js
const axios = require('axios');

// Load the grid from your JSON file. Make sure grid.json is in the same directory.
const grid = require('/Users/harshsharma/Desktop/Sudoku/SudokuMULTI/ColumnBasedSolver/solution.json');

axios.post('http://localhost:3005/solve', { board: grid })
  .then(response => {
    console.log('Response:', response.data);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });