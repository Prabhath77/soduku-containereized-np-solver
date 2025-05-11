// Calculate the dimensions of each block in a Sudoku grid
function getBlockDimensions(n) {
  const root = Math.sqrt(n);
  if (Number.isInteger(root)) {
    return [root, root];
  }
  
  for (let i = Math.floor(Math.sqrt(n)); i >= 1; i--) {
    if (n % i === 0) {
      return [i, n / i];
    }
  }
  
  throw new Error("Grid size must have integer factors");
}

// Fast validity check for number placement
function isValid(board, row, col, num) {
  const n = board.length;
  
  // Check row
  for (let i = 0; i < n; i++) {
    if (board[row][i] === num) {
      return false;
    }
  }
  
  // Check column
  for (let i = 0; i < n; i++) {
    if (board[i][col] === num) {
      return false;
    }
  }
  
  // Check block
  const [blockRows, blockCols] = getBlockDimensions(n);
  const blockRowStart = Math.floor(row / blockRows) * blockRows;
  const blockColStart = Math.floor(col / blockCols) * blockCols;
  
  for (let r = 0; r < blockRows; r++) {
    for (let c = 0; c < blockCols; c++) {
      if (board[blockRowStart + r][blockColStart + c] === num) {
        return false;
      }
    }
  }
  
  return true;
}

// Find an empty position for backtracking
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

// Get all possible candidates for a cell
function getCandidates(board, row, col) {
  const n = board.length;
  const candidates = [];
  
  if (board[row][col] !== 0) return candidates;
  
  for (let num = 1; num <= n; num++) {
    if (isValid(board, row, col, num)) {
      candidates.push(num);
    }
  }
  
  return candidates;
}

// Create a candidate map for the entire board
function createCandidateMap(board) {
  const n = board.length;
  const candidateMap = Array(n).fill().map(() => 
    Array(n).fill().map(() => []));
  
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (board[row][col] === 0) {
        candidateMap[row][col] = getCandidates(board, row, col);
      }
    }
  }
  
  return candidateMap;
}

// Apply naked singles technique
function applyNakedSingles(board, candidateMap) {
  const n = board.length;
  let changed = false;
  
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (board[row][col] === 0 && candidateMap[row][col].length === 1) {
        board[row][col] = candidateMap[row][col][0];
        candidateMap[row][col] = [];
        changed = true;
      }
    }
  }
  
  return changed;
}

// Apply hidden singles technique
function applyHiddenSingles(board, candidateMap) {
  const n = board.length;
  let changed = false;
  const [blockRows, blockCols] = getBlockDimensions(n);
  
  // Check rows
  for (let row = 0; row < n; row++) {
    const numCounts = {};
    
    for (let col = 0; col < n; col++) {
      if (board[row][col] === 0) {
        candidateMap[row][col].forEach(num => {
          numCounts[num] = (numCounts[num] || []).concat([[row, col]]);
        });
      }
    }
    
    for (const [num, positions] of Object.entries(numCounts)) {
      if (positions.length === 1) {
        const [r, c] = positions[0];
        board[r][c] = parseInt(num);
        candidateMap[r][c] = [];
        changed = true;
      }
    }
  }
  
  // Check columns
  for (let col = 0; col < n; col++) {
    const numCounts = {};
    
    for (let row = 0; row < n; row++) {
      if (board[row][col] === 0) {
        candidateMap[row][col].forEach(num => {
          numCounts[num] = (numCounts[num] || []).concat([[row, col]]);
        });
      }
    }
    
    for (const [num, positions] of Object.entries(numCounts)) {
      if (positions.length === 1) {
        const [r, c] = positions[0];
        board[r][c] = parseInt(num);
        candidateMap[r][c] = [];
        changed = true;
      }
    }
  }
  
  // Check blocks
  for (let blockRow = 0; blockRow < n/blockRows; blockRow++) {
    for (let blockCol = 0; blockCol < n/blockCols; blockCol++) {
      const numCounts = {};
      
      for (let r = 0; r < blockRows; r++) {
        for (let c = 0; c < blockCols; c++) {
          const row = blockRow * blockRows + r;
          const col = blockCol * blockCols + c;
          
          if (board[row][col] === 0) {
            candidateMap[row][col].forEach(num => {
              numCounts[num] = (numCounts[num] || []).concat([[row, col]]);
            });
          }
        }
      }
      
      for (const [num, positions] of Object.entries(numCounts)) {
        if (positions.length === 1) {
          const [r, c] = positions[0];
          board[r][c] = parseInt(num);
          candidateMap[r][c] = [];
          changed = true;
        }
      }
    }
  }
  
  return changed;
}

// Helper function to get combinations
function getCombinations(arr, k) {
  if (k === 1) return arr.map(e => [e]);
  
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    const tailCombinations = getCombinations(arr.slice(i + 1), k - 1);
    for (const tailCombo of tailCombinations) {
      result.push([head, ...tailCombo]);
    }
  }
  
  return result;
}

// Apply naked pairs/triples/quads technique
function applyNakedGroups(board, candidateMap) {
  const n = board.length;
  let changed = false;
  const [blockRows, blockCols] = getBlockDimensions(n);
  
  // Helper function to find and apply naked groups
  function findNakedGroups(cells) {
    // Find cells with 2-4 candidates
    const potentialGroups = cells.filter(cell => {
      const [r, c] = cell;
      return board[r][c] === 0 && 
             candidateMap[r][c].length >= 2 && 
             candidateMap[r][c].length <= 4;
    });
    
    // Check for naked pairs, triples, and quads
    for (let size = 2; size <= 4; size++) {
      if (potentialGroups.length < size) continue;
      
      // Find all combinations of 'size' cells
      const combinations = getCombinations(potentialGroups, size);
      
      for (const combo of combinations) {
        // Get unique candidates across these cells
        const allCandidates = new Set();
        combo.forEach(([r, c]) => {
          candidateMap[r][c].forEach(num => allCandidates.add(num));
        });
        
        // If we have exactly 'size' candidates, we found a naked group
        if (allCandidates.size === size) {
          const candidatesArray = Array.from(allCandidates);
          
          // Remove these candidates from other cells in the same unit
          let localChanged = false;
          cells.forEach(([r, c]) => {
            if (board[r][c] === 0 && !combo.some(cell => cell[0] === r && cell[1] === c)) {
              const before = candidateMap[r][c].length;
              candidateMap[r][c] = candidateMap[r][c].filter(num => !allCandidates.has(num));
              if (before !== candidateMap[r][c].length) localChanged = true;
            }
          });
          
          if (localChanged) changed = true;
        }
      }
    }
  }
  
  // Check rows
  for (let row = 0; row < n; row++) {
    const cells = [];
    for (let col = 0; col < n; col++) {
      cells.push([row, col]);
    }
    findNakedGroups(cells);
  }
  
  // Check columns
  for (let col = 0; col < n; col++) {
    const cells = [];
    for (let row = 0; row < n; row++) {
      cells.push([row, col]);
    }
    findNakedGroups(cells);
  }
  
  // Check blocks
  for (let blockRow = 0; blockRow < n/blockRows; blockRow++) {
    for (let blockCol = 0; blockCol < n/blockCols; blockCol++) {
      const cells = [];
      for (let r = 0; r < blockRows; r++) {
        for (let c = 0; c < blockCols; c++) {
          const row = blockRow * blockRows + r;
          const col = blockCol * blockCols + c;
          cells.push([row, col]);
        }
      }
      findNakedGroups(cells);
    }
  }
  
  return changed;
}

// Apply pointing pairs/triples technique
function applyPointingPairs(board, candidateMap) {
  const n = board.length;
  let changed = false;
  const [blockRows, blockCols] = getBlockDimensions(n);
  
  // For each block
  for (let blockRow = 0; blockRow < n/blockRows; blockRow++) {
    for (let blockCol = 0; blockCol < n/blockCols; blockCol++) {
      // For each candidate number
      for (let num = 1; num <= n; num++) {
        // Find all positions of this candidate in the block
        const positions = [];
        for (let r = 0; r < blockRows; r++) {
          for (let c = 0; c < blockCols; c++) {
            const row = blockRow * blockRows + r;
            const col = blockCol * blockCols + c;
            
            if (board[row][col] === 0 && candidateMap[row][col].includes(num)) {
              positions.push([row, col]);
            }
          }
        }
        
        // If candidate appears in 2 or 3 cells all in the same row
        if (positions.length >= 2 && positions.length <= 3) {
          // Check if all are in the same row
          const rowCheck = positions[0][0];
          if (positions.every(pos => pos[0] === rowCheck)) {
            // Remove this candidate from other cells in the same row
            let localChanged = false;
            for (let col = 0; col < n; col++) {
              const blockColStart = blockCol * blockCols;
              const blockColEnd = blockColStart + blockCols - 1;
              
              if (col < blockColStart || col > blockColEnd) { // Outside the block
                if (board[rowCheck][col] === 0 && candidateMap[rowCheck][col].includes(num)) {
                  candidateMap[rowCheck][col] = candidateMap[rowCheck][col].filter(n => n !== num);
                  localChanged = true;
                }
              }
            }
            if (localChanged) changed = true;
          }
          
          // Check if all are in the same column
          const colCheck = positions[0][1];
          if (positions.every(pos => pos[1] === colCheck)) {
            // Remove this candidate from other cells in the same column
            let localChanged = false;
            for (let row = 0; row < n; row++) {
              const blockRowStart = blockRow * blockRows;
              const blockRowEnd = blockRowStart + blockRows - 1;
              
              if (row < blockRowStart || row > blockRowEnd) { // Outside the block
                if (board[row][colCheck] === 0 && candidateMap[row][colCheck].includes(num)) {
                  candidateMap[row][colCheck] = candidateMap[row][colCheck].filter(n => n !== num);
                  localChanged = true;
                }
              }
            }
            if (localChanged) changed = true;
          }
        }
      }
    }
  }
  
  return changed;
}

// Advanced constraint propagation engine
function enhancedConstraintPropagation(board) {
  const n = board.length;
  let candidateMap = createCandidateMap(board);
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 1000; // High limit to ensure we don't give up
  
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    
    // Apply techniques from simplest to most complex
    changed = applyNakedSingles(board, candidateMap) || changed;
    
    // Update candidate map after each fill
    if (changed) {
      candidateMap = createCandidateMap(board);
      continue;
    }
    
    changed = applyHiddenSingles(board, candidateMap) || changed;
    
    if (changed) {
      candidateMap = createCandidateMap(board);
      continue;
    }
    
    changed = applyNakedGroups(board, candidateMap) || changed;
    
    if (changed) {
      candidateMap = createCandidateMap(board);
      continue;
    }
    
    changed = applyPointingPairs(board, candidateMap) || changed;
    
    if (changed) {
      candidateMap = createCandidateMap(board);
    }
  }
  
  return board;
}

// Original naked singles implementation (kept for compatibility)
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

// Fisher-Yates shuffle with seed for reproducibility
function shuffleArray(array, seed) {
  const shuffled = [...array];
  let currentSeed = seed;
  
  const random = () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

// Enhanced backtracking that uses MRV heuristic
function findBestEmptyPosition(board, candidateMap) {
  let minCandidates = Infinity;
  let bestPos = null;
  const n = board.length;
  
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (board[row][col] === 0) {
        const candidates = candidateMap[row][col];
        if (candidates.length < minCandidates) {
          minCandidates = candidates.length;
          bestPos = [row, col];
          // Early exit for cells with only one candidate
          if (minCandidates === 1) return bestPos;
        }
      }
    }
  }
  
  return bestPos || findEmptyPosition(board);
}

// Backtracking solver with advanced heuristics
function backtrackingSolver(board) {
  // First apply enhanced constraint propagation
  enhancedConstraintPropagation(board);
  
  const candidateMap = createCandidateMap(board);
  const pos = findBestEmptyPosition(board, candidateMap);
  
  if (!pos) {
    return true; // Puzzle solved
  }
  
  const [row, col] = pos;
  
  for (const num of candidateMap[row][col]) {
    board[row][col] = num;
    if (backtrackingSolver(board)) {
      return true;
    }
    board[row][col] = 0;
  }
  
  return false;
}

// Stochastic backtracking with randomized value selection and advanced heuristics
function stochasticBacktrackingSolver(board, seed = Date.now()) {
  // First apply enhanced constraint propagation
  enhancedConstraintPropagation(board);
  
  const candidateMap = createCandidateMap(board);
  const pos = findBestEmptyPosition(board, candidateMap);
  
  if (!pos) {
    return true;
  }
  
  const [row, col] = pos;
  
  // Shuffle candidates for stochastic behavior
  const shuffledCandidates = shuffleArray(candidateMap[row][col], seed + row * board.length + col);
  
  for (const num of shuffledCandidates) {
    board[row][col] = num;
    if (stochasticBacktrackingSolver(board, seed + 1)) {
      return true;
    }
    board[row][col] = 0;
  }
  
  return false;
}

// Main solving function with enhanced techniques
function solveSudoku(board, useStochastic = false) {
  const boardCopy = board.map(row => [...row]);
  
  // Apply enhanced constraint propagation first
  enhancedConstraintPropagation(boardCopy);
  
  // If already solved by constraint propagation, return early
  if (!findEmptyPosition(boardCopy)) {
    return boardCopy;
  }
  
  // Then solve with backtracking
  if (useStochastic) {
    if (stochasticBacktrackingSolver(boardCopy)) {
      return boardCopy;
    }
  } else {
    if (backtrackingSolver(boardCopy)) {
      return boardCopy;
    }
  }
  
  return null; // If unsolvable
}

/**
 * Enhanced Column-based solver class compatible with the distributed system
 * Optimized for solving Sudoku puzzles column by column with advanced techniques
 */
class SudokuSolver {
  constructor() {
    this.seed = Date.now();
  }

  // Build a full 2D board from a column and the overall board state
  getFullBoardWithColumn(column, originalBoard, colIndex) {
    const size = originalBoard.length;
    const fullBoard = originalBoard.map(row => [...row]);
    
    for (let row = 0; row < size; row++) {
      fullBoard[row][colIndex] = column[row][0];
    }
    
    return fullBoard;
  }

  // Check if placing a value in a column is valid in the context of the full board
  isValidInColumn(column, originalBoard, colIndex, row, value) {
    // First, check if this value already exists in the column
    for (let i = 0; i < column.length; i++) {
      if (i !== row && column[i][0] === value) {
        return false; // Value already exists in this column
      }
    }
    
    // Create temporary full board to check validity
    const fullBoard = this.getFullBoardWithColumn(column, originalBoard, colIndex);
    // Replace with the value we're checking
    fullBoard[row][colIndex] = value;
    
    // Check row (only need to check this row)
    const n = fullBoard.length;
    for (let c = 0; c < n; c++) {
      if (c !== colIndex && fullBoard[row][c] === value) {
        return false;
      }
    }
    
    // Check block
    const [blockRows, blockCols] = getBlockDimensions(n);
    const blockRowStart = Math.floor(row / blockRows) * blockRows;
    const blockColStart = Math.floor(colIndex / blockCols) * blockCols;
    
    for (let r = 0; r < blockRows; r++) {
      for (let c = 0; c < blockCols; c++) {
        const checkRow = blockRowStart + r;
        const checkCol = blockColStart + c;
        if ((checkCol !== colIndex || checkRow !== row) && 
            fullBoard[checkRow][checkCol] === value) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  // Get candidates for a cell in the column
  getCandidatesForCell(column, originalBoard, colIndex, row) {
    if (column[row][0] !== 0) return [];
    
    const candidates = [];
    const size = originalBoard.length;
    
    for (let num = 1; num <= size; num++) {
      if (this.isValidInColumn(column, originalBoard, colIndex, row, num)) {
        candidates.push(num);
      }
    }
    
    return candidates;
  }
  
  // Create candidate map for a column
  createColumnCandidateMap(column, originalBoard, colIndex) {
    const candidateMap = [];
    const size = column.length;
    
    for (let row = 0; row < size; row++) {
      candidateMap[row] = this.getCandidatesForCell(column, originalBoard, colIndex, row);
    }
    
    return candidateMap;
  }

  // Apply naked singles to a column
  applyNakedSinglesForColumn(column, originalBoard, colIndex) {
    const size = column.length;
    let changed = true;
    let sureMask = Array(size).fill(false);
    const candidateMap = this.createColumnCandidateMap(column, originalBoard, colIndex);
    
    while (changed) {
      changed = false;
      for (let row = 0; row < size; row++) {
        if (column[row][0] === 0 && candidateMap[row].length === 1) {
          column[row][0] = candidateMap[row][0];
          sureMask[row] = true;
          
          // Update candidates for other cells in this column
          for (let r = 0; r < size; r++) {
            if (r !== row && column[r][0] === 0) {
              const index = candidateMap[r].indexOf(candidateMap[row][0]);
              if (index !== -1) {
                candidateMap[r].splice(index, 1);
              }
            }
          }
          
          changed = true;
        } else if (column[row][0] !== 0) {
          sureMask[row] = true;
        }
      }
    }
    
    return { column, sureMask, candidateMap };
  }
  
  // Apply hidden singles to a column
  applyHiddenSinglesForColumn(column, candidateMap, sureMask) {
    const size = column.length;
    let changed = false;
    
    // Count occurrences of each candidate value in the column
    const valueCounts = {};
    for (let row = 0; row < size; row++) {
      if (column[row][0] === 0) {
        candidateMap[row].forEach(val => {
          if (!valueCounts[val]) {
            valueCounts[val] = [];
          }
          valueCounts[val].push(row);
        });
      }
    }
    
    // Check if any value appears only once
    for (const [value, positions] of Object.entries(valueCounts)) {
      if (positions.length === 1) {
        const row = positions[0];
        column[row][0] = parseInt(value);
        sureMask[row] = true;
        
        // Update candidateMap by removing this value from other rows
        for (let r = 0; r < size; r++) {
          if (r !== row && candidateMap[r].includes(parseInt(value))) {
            candidateMap[r] = candidateMap[r].filter(v => v !== parseInt(value));
          }
        }
        
        changed = true;
      }
    }
    
    return changed;
  }
  
  // Enhanced column constraint propagation
  applyAdvancedConstraintsForColumn(column, originalBoard, colIndex) {
    const size = column.length;
    let sureMask = Array(size).fill(false);
    
    // Initial constraint application
    let { column: updatedColumn, sureMask: updatedSureMask, candidateMap } = 
      this.applyNakedSinglesForColumn([...column.map(row => [...row])], originalBoard, colIndex);
    
    sureMask = updatedSureMask;
    column = updatedColumn;
    
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 50; // Limit iterations for columns
    
    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;
      
      // Apply hidden singles
      if (this.applyHiddenSinglesForColumn(column, candidateMap, sureMask)) {
        changed = true;
        // Update candidate map
        candidateMap = this.createColumnCandidateMap(column, originalBoard, colIndex);
        continue;
      }
      
      // Apply naked pairs/triples (simplified for columns)
      if (this.applyNakedGroupsForColumn(column, candidateMap, originalBoard, colIndex)) {
        changed = true;
        candidateMap = this.createColumnCandidateMap(column, originalBoard, colIndex);
      }
    }
    
    return { column, sureMask };
  }
  
  // Apply naked pairs/triples to a column
  applyNakedGroupsForColumn(column, candidateMap, originalBoard, colIndex) {
    const size = column.length;
    let changed = false;
    
    // Find cells with 2-3 candidates
    const potentialGroups = [];
    for (let row = 0; row < size; row++) {
      if (column[row][0] === 0 && candidateMap[row].length >= 2 && candidateMap[row].length <= 3) {
        potentialGroups.push(row);
      }
    }
    
    // Check for naked pairs
    for (let size = 2; size <= 3; size++) {
      if (potentialGroups.length < size) continue;
      
      // Find all combinations of 'size' cells
      const combinations = getCombinations(potentialGroups, size);
      
      for (const combo of combinations) {
        // Get unique candidates across these cells
        const allCandidates = new Set();
        combo.forEach(row => {
          candidateMap[row].forEach(num => allCandidates.add(num));
        });
        
        // If we have exactly 'size' candidates, we found a naked group
        if (allCandidates.size === size) {
          const candidatesArray = Array.from(allCandidates);
          
          // Remove these candidates from other cells in the column
          let localChanged = false;
          for (let row = 0; row < size; row++) {
            if (column[row][0] === 0 && !combo.includes(row)) {
              const before = candidateMap[row].length;
              candidateMap[row] = candidateMap[row].filter(num => !allCandidates.has(num));
              if (before !== candidateMap[row].length) localChanged = true;
            }
          }
          
          if (localChanged) changed = true;
        }
      }
    }
    
    return changed;
  }

  // Find best empty position in column for backtracking
  findBestEmptyPositionInColumn(column, candidateMap) {
    let minCandidates = Infinity;
    let bestPosition = -1;
    
    for (let row = 0; row < column.length; row++) {
      if (column[row][0] === 0) {
        const candidateCount = candidateMap[row].length;
        if (candidateCount < minCandidates) {
          minCandidates = candidateCount;
          bestPosition = row;
          if (minCandidates === 1) break; // Found a cell with only one candidate
        }
      }
    }
    
    return bestPosition;
  }

  // Backtracking for a column with MRV heuristic
  backtrackColumn(column, originalBoard, colIndex, candidateMap, sureMask) {
    // Find best empty position
    const row = this.findBestEmptyPositionInColumn(column, candidateMap);
    if (row === -1) {
      return true; // Column is fully solved
    }
    
    // Try each candidate
    for (const num of candidateMap[row]) {
      column[row][0] = num;
      
      // Create updated candidate map for next cells
      const updatedCandidateMap = this.createColumnCandidateMap(column, originalBoard, colIndex);
      
      if (this.backtrackColumn(column, originalBoard, colIndex, updatedCandidateMap, sureMask)) {
        return true;
      }
      
      column[row][0] = 0;
    }
    
    return false;
  }

  // Stochastic backtracking for column with advanced heuristics
  stochasticBacktrackColumn(column, originalBoard, colIndex, candidateMap, sureMask) {
    // Find best empty position
    const row = this.findBestEmptyPositionInColumn(column, candidateMap);
    if (row === -1) {
      return true; // Column is fully solved
    }
    
    // Shuffle candidates for diversity
    const shuffledCandidates = shuffleArray([...candidateMap[row]], this.seed + row * 100);
    
    for (const num of shuffledCandidates) {
      column[row][0] = num;
      this.seed = (this.seed + 1) % Number.MAX_SAFE_INTEGER;
      
      // Update candidate map for next cells
      const updatedCandidateMap = this.createColumnCandidateMap(column, originalBoard, colIndex);
      
      if (this.stochasticBacktrackColumn(column, originalBoard, colIndex, updatedCandidateMap, sureMask)) {
        return true;
      }
      
      column[row][0] = 0;
    }
    
    return false;
  }

  // Main column solving method with enhanced constraint propagation
  hybridSolve(column, originalBoard, colIndex) {
    // First apply advanced constraint propagation
    const { column: constraintColumn, sureMask } = 
      this.applyAdvancedConstraintsForColumn([...column.map(row => [...row])], originalBoard, colIndex);
    
    // Check if column is already solved by constraint propagation
    if (constraintColumn.every(cell => cell[0] !== 0)) {
      return { column: constraintColumn, sure: sureMask };
    }
    
    // Build candidate map for backtracking
    const candidateMap = this.createColumnCandidateMap(constraintColumn, originalBoard, colIndex);
    
    // Try stochastic backtracking first
    const stochasticColumn = [...constraintColumn.map(row => [...row])];
    const stochasticSureMask = [...sureMask];
    
    if (this.stochasticBacktrackColumn(stochasticColumn, originalBoard, colIndex, candidateMap, stochasticSureMask)) {
      return { column: stochasticColumn, sure: stochasticSureMask };
    }
    
    // Fall back to deterministic backtracking if stochastic fails
    const deterministicColumn = [...column.map(row => [...row])];
    const deterministicSureMask = Array(column.length).fill(false);
    
    if (this.backtrackColumn(deterministicColumn, originalBoard, colIndex, candidateMap, deterministicSureMask)) {
      return { column: deterministicColumn, sure: deterministicSureMask };
    }
    
    throw new Error("Column cannot be solved");
  }
}

// Optimized block solver (stub implementation for compatibility)
class SudokuBlockSolver {
  constructor(originalBoard, blockRow, blockCol) {
    // Initialize properties for BlockSolver
    this.originalBoard = originalBoard.map(row => [...row]);
    this.size = originalBoard.length;
    const [blockRows, blockCols] = getBlockDimensions(this.size);
    this.blockRows = blockRows;
    this.blockCols = blockCols;
    this.blockRow = blockRow;
    this.blockCol = blockCol;
    this.startRow = blockRow * blockRows;
    this.startCol = blockCol * blockCols;
    
    // Extract block data
    this.block = [];
    this.fixed = [];
    this.sure = [];
    
    for (let i = 0; i < blockRows; i++) {
      this.block[i] = [];
      this.fixed[i] = [];
      this.sure[i] = [];
      for (let j = 0; j < blockCols; j++) {
        const value = originalBoard[this.startRow + i][this.startCol + j];
        this.block[i][j] = value;
        this.fixed[i][j] = value !== 0;
        this.sure[i][j] = value !== 0;
      }
    }
    
    this.seed = Date.now() + blockRow * 1000 + blockCol * 100;
  }
  
  solve() {
    // Placeholder implementation - not used in this column-based solver
    return { block: this.block, sure: this.sure };
  }
}

module.exports = {
  solveSudoku,
  getBlockDimensions,
  isValid,
  enhancedConstraintPropagation,
  SudokuSolver
};