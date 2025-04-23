// solver.js

// Applies naked singles propagation: for each empty cell, if exactly one valid candidate exists, fill it in.
function applyNakedSingles(board) {
  const n = board.length;
  let changed = true;

  function isValid(board, row, col, num) {
    for (let i = 0; i < n; i++) {
      if (board[row][i] === num || board[i][col] === num) return false;
    }
    const root = Math.sqrt(n);
    const boxRowStart = Math.floor(row / root) * root;
    const boxColStart = Math.floor(col / root) * root;
    for (let r = 0; r < root; r++) {
      for (let c = 0; c < root; c++) {
        if (board[boxRowStart + r][boxColStart + c] === num) return false;
      }
    }
    return true;
  }

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

// This solver uses simulated annealing to solve Sudoku.
// It creates an initial candidate solution and then iteratively swaps non-fixed cells to reduce conflicts.
function solveSudoku(board) {
  const n = board.length;
  
  // Create a fixed mask: true for pre-filled cells, false for empty cells.
  // First, create a deep copy of board and apply naked singles.
  let boardCopy = board.map(row => row.slice());
  applyNakedSingles(boardCopy);
  
  const fixed = boardCopy.map(row => row.map(cell => cell !== 0));
  
  // Create an initial candidate solution by filling each row's missing digits randomly.
  let currentSolution = boardCopy.map(row => row.slice());
  for (let i = 0; i < n; i++) {
    const row = currentSolution[i];
    const missing = [];
    for (let d = 1; d <= n; d++) {
      if (!row.includes(d)) {
        missing.push(d);
      }
    }
    // Shuffle missing numbers.
    for (let j = missing.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [missing[j], missing[k]] = [missing[k], missing[j]];
    }
    let index = 0;
    for (let j = 0; j < n; j++) {
      if (!fixed[i][j]) {
        row[j] = missing[index++];
      }
    }
  }
  
  // Energy function: counts conflicts in columns and blocks.
  function energy(solution) {
    let conflicts = 0;
    // Count column conflicts.
    for (let j = 0; j < n; j++) {
      const count = new Array(n + 1).fill(0);
      for (let i = 0; i < n; i++) {
        count[solution[i][j]]++;
      }
      for (let d = 1; d <= n; d++) {
        if (count[d] > 1) conflicts += count[d] - 1;
      }
    }
    // Count block conflicts.
    const root = Math.sqrt(n);
    for (let br = 0; br < root; br++) {
      for (let bc = 0; bc < root; bc++) {
        const count = new Array(n + 1).fill(0);
        for (let i = 0; i < root; i++) {
          for (let j = 0; j < root; j++) {
            const val = solution[br * root + i][bc * root + j];
            count[val]++;
          }
        }
        for (let d = 1; d <= n; d++) {
          if (count[d] > 1) conflicts += count[d] - 1;
        }
      }
    }
    return conflicts;
  }
  
  let currentEnergy = energy(currentSolution);
  let iteration = 0;
  console.log("Initial energy:", currentEnergy);
  
  // Simulated annealing parameters.
  let T = 1.0;
  const T_min = 1e-4;
  const alpha = 0.9999;
  
  // Run until a solution (zero conflicts) is found.
  while (currentEnergy > 0) {
    iteration++;
    // Choose a random row.
    const i = Math.floor(Math.random() * n);
    
    // Get indices of non-fixed cells in this row.
    const indices = [];
    for (let j = 0; j < n; j++) {
      if (!fixed[i][j]) indices.push(j);
    }
    if (indices.length < 2) continue;
    
    // Pick two random non-fixed positions.
    const j1 = indices[Math.floor(Math.random() * indices.length)];
    let j2 = indices[Math.floor(Math.random() * indices.length)];
    while (j2 === j1) {
      j2 = indices[Math.floor(Math.random() * indices.length)];
    }
    
    // Create a new candidate solution by swapping the two cells.
    const newSolution = currentSolution.map(row => row.slice());
    [newSolution[i][j1], newSolution[i][j2]] = [newSolution[i][j2], newSolution[i][j1]];
    
    const newEnergy = energy(newSolution);
    const delta = newEnergy - currentEnergy;
    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      currentSolution = newSolution;
      currentEnergy = newEnergy;
    }
    
    // Cool the system.
    T *= alpha;
    if (T < T_min) {
      T = 1.0; // Reset temperature.
      console.log("Temperature reset at iteration", iteration);
    }
    
    if (iteration % 10000 === 0) {
      console.log(`Iteration ${iteration}, Energy: ${currentEnergy}`);
    }
  }
  
  console.log("Solution found after", iteration, "iterations.");
  return currentSolution;
}

module.exports = { solveSudoku };