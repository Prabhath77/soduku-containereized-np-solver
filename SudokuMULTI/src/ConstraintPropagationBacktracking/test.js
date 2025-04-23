// test100x100.js
const axios = require('axios');

// Generates a number for position (r, c) based on a base pattern.
function pattern(r, c, base) {
  return (base * (r % base) + Math.floor(r / base) + c) % (base * base);
}

// Fisher–Yates shuffle.
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Generates a fully solved 100x100 sudoku grid with 10x10 subgrids.
function generate100x100Sudoku() {
  const base = 10;
  const side = base * base; // 100
  const rows = [];
  const cols = [];
  const nums = shuffle([...Array(side).keys()].map(i => i + 1));
  const baseRange = [...Array(base).keys()];

  // Shuffle groups and then positions within groups.
  for (let g of shuffle([...baseRange])) {
    for (let r of shuffle([...baseRange])) {
      rows.push(g * base + r);
    }
  }
  for (let g of shuffle([...baseRange])) {
    for (let c of shuffle([...baseRange])) {
      cols.push(g * base + c);
    }
  }
  const board = [];
  for (let r of rows) {
    const row = [];
    for (let c of cols) {
      row.push(nums[pattern(r, c, base)]);
    }
    board.push(row);
  }
  return board;
}

// Remove a given percentage of cells from the board by setting them to 0.
function removePercentage(board, percentage) {
  const side = board.length; // should be 100
  const totalCells = side * side;
  const numToRemove = Math.floor(totalCells * (percentage / 100));
  const positions = [];
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      positions.push({ i, j });
    }
  }
  shuffle(positions);
  for (let k = 0; k < numToRemove; k++) {
    const pos = positions[k];
    board[pos.i][pos.j] = 0;
  }
}

// Generate the grid and remove 10% of cells.
const solvedGrid = generate100x100Sudoku();
removePercentage(solvedGrid, 20);

// Post the grid to the master server.
axios.post('http://localhost:3000/solve', { board: solvedGrid })
  .then(response => {
    console.log('Response:', response.data);
  })
  .catch(error => {
    console.error('Error:', error.message);
  });