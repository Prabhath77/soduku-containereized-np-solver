const axios = require('axios');

// Load the grid from your JSON file. Make sure grid.json is in the same directory.
const grid = [
    
[5, 3, 4, 6, 0, 8, 9, 0, 2],
[0, 7, 2, 1, 9, 5, 3, 4, 8],
[1, 9, 0, 3, 0, 2, 0, 0, 7],
[8, 0, 9, 0, 6, 0, 4, 2, 0],
[0, 2, 0, 8, 0, 3, 0, 9, 1],
[7, 0, 3, 9, 0, 4, 8, 0, 6],
[9, 6, 0, 0, 3, 0, 2, 8, 0],
[0, 8, 7, 4, 0, 9, 0, 3, 5],
[3, 4, 5, 0, 8, 6, 1, 0, 9]

];

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