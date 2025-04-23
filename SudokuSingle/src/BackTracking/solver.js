// solver.js

// Checks if placing num at (row, col) is valid.
function isValid(board, row, col, num) {
  const n = board.length;
  for (let i = 0; i < n; i++) {
    if (board[row][i] === num || board[i][col] === num) {
      return false;
    }
  }
  const root = Math.sqrt(n);
  const boxRowStart = Math.floor(row / root) * root;
  const boxColStart = Math.floor(col / root) * root;
  for (let r = 0; r < root; r++) {
    for (let c = 0; c < root; c++) {
      if (board[boxRowStart + r][boxColStart + c] === num) {
        return false;
      }
    }
  }
  return true;
}

// Finds an empty position; returns [row, col] or null if none.
function findEmptyPosition(board) {
  const n = board.length;
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (board[row][col] === 0) {
        return [row, col];
      }
    }
  }
  return null;
}

// Applies naked singles propagation: for each empty cell, if there is exactly one candidate, fill it.
function applyNakedSingles(board) {
  const n = board.length;
  let changed = true;
  while (changed) {
    changed = false;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (board[row][col] === 0) {
          let candidates = [];
          for (let num = 1; num <= n; num++) {
            if (isValid(board, row, col, num)) {
              candidates.push(num);
            }
          }
          if (candidates.length === 1) {
            board[row][col] = candidates[0];
            changed = true;
          }
        }
      }
    }
  }
  return board;
}

// The backtracking solver using recursion.
function backtrackingSolver(board) {
  const pos = findEmptyPosition(board);
  if (!pos) {
    return true; // Puzzle solved.
  }
  
  const [row, col] = pos;
  const n = board.length;
  for (let num = 1; num <= n; num++) {
    if (isValid(board, row, col, num)) {
      board[row][col] = num;
      if (backtrackingSolver(board)) {
        return true;
      }
      board[row][col] = 0;
    }
  }
  return false;
}
  
// solveSudoku first applies naked singles, then finishes with backtracking.
function solveSudoku(board) {
  // Create a deep copy of the board.
  const boardCopy = board.map(row => row.slice());
  // First, apply naked singles propagation.
  applyNakedSingles(boardCopy);
  // Then, try to solve the remainder with backtracking.
  if (backtrackingSolver(boardCopy)) {
    return boardCopy;
  }
  return null; // If unsolvable.
}
  
module.exports = { solveSudoku };