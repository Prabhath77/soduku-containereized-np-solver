// test25x25.js
const axios = require('axios');

// Load the grid from your JSON file. Make sure grid.json is in the same directory.
const grid = require ('/Users/harshsharma/Desktop/Sudoku/soduku-containereized-np-solver/python/testingfiles/solution64x6425%.json');
axios.post('http://localhost:3050/solve', { board: grid })
  .then(response => {
    console.log('Response:', response.data);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });