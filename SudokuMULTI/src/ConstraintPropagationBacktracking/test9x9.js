// test25x25.js
const axios = require('axios');

// Load the grid from your JSON file. Make sure grid.json is in the same directory.
const grid = [
  [5, 0, 0, 6, 0, 0, 9, 0, 0],
  [0, 7, 0, 0, 9, 0, 0, 4, 0],
  [0, 0, 8, 0, 0, 2, 0, 0, 0],
  [8, 0, 0, 0, 6, 0, 4, 0, 0],
  [0, 2, 0, 0, 0, 0, 0, 9, 0],
  [0, 0, 3, 0, 2, 0, 8, 0, 6],
  [0, 6, 0, 0, 3, 0, 0, 8, 0],
  [0, 8, 0, 4, 0, 9, 0, 0, 5],
  [0, 0, 5, 0, 0, 0, 1, 0, 9]

];
axios.post('http://localhost:3000/solve', { board: grid })
  .then(response => {
    console.log('Response:', response.data);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });