/**
 * Enhanced Sudoku solver with advanced constraint propagation techniques
 * Optimized for distributed solving with the master-slave architecture
 */

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

// Simple and fast validity check
function isValid(board, row, col, num) {
  const n = board.length;
  
  // Check row and column
  for (let i = 0; i < n; i++) {
    if (board[row][i] === num || board[i][col] === num) {
      return false;
    }
  }
  
  // Check block - works for both square and rectangular blocks
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

// Find the first empty position
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

// Find the most constrained position (MRV heuristic - minimal remaining values)
function findBestEmptyPosition(board, candidateMap) {
  let minCandidates = Infinity;
  let bestPos = null;
  const n = board.length;
  
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (board[row][col] === 0) {
        const candidateCount = candidateMap[row][col].length;
        if (candidateCount < minCandidates) {
          minCandidates = candidateCount;
          bestPos = [row, col];
          // Early exit for cells with only one candidate
          if (minCandidates === 1) return bestPos;
        }
      }
    }
  }
  
  return bestPos;
}

// Get all possible values for a cell
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

// ====== ADVANCED CONSTRAINT PROPAGATION TECHNIQUES ======

// Find and apply naked singles
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

// Find and apply hidden singles
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

// Get all combinations of size k from array arr
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

// Check if arrays are equal (helper for naked groups)
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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

// Apply box-line reduction technique
function applyBoxLineReduction(board, candidateMap) {
  const n = board.length;
  let changed = false;
  const [blockRows, blockCols] = getBlockDimensions(n);
  
  // Check rows
  for (let row = 0; row < n; row++) {
    const blockRow = Math.floor(row / blockRows);
    
    // For each candidate
    for (let num = 1; num <= n; num++) {
      // Find all columns in this row that contain this candidate
      const cols = [];
      for (let col = 0; col < n; col++) {
        if (board[row][col] === 0 && candidateMap[row][col].includes(num)) {
          cols.push(col);
        }
      }
      
      if (cols.length > 0) {
        // Check if all these columns are in the same block
        const blockCol = Math.floor(cols[0] / blockCols);
        if (cols.every(col => Math.floor(col / blockCols) === blockCol)) {
          // Remove this candidate from other cells in the same block
          let localChanged = false;
          for (let r = 0; r < blockRows; r++) {
            const curRow = blockRow * blockRows + r;
            if (curRow !== row) {
              for (let c = 0; c < blockCols; c++) {
                const curCol = blockCol * blockCols + c;
                if (board[curRow][curCol] === 0 && candidateMap[curRow][curCol].includes(num)) {
                  candidateMap[curRow][curCol] = candidateMap[curRow][curCol].filter(n => n !== num);
                  localChanged = true;
                }
              }
            }
          }
          if (localChanged) changed = true;
        }
      }
    }
  }
  
  // Check columns
  for (let col = 0; col < n; col++) {
    const blockCol = Math.floor(col / blockCols);
    
    // For each candidate
    for (let num = 1; num <= n; num++) {
      // Find all rows in this column that contain this candidate
      const rows = [];
      for (let row = 0; row < n; row++) {
        if (board[row][col] === 0 && candidateMap[row][col].includes(num)) {
          rows.push(row);
        }
      }
      
      if (rows.length > 0) {
        // Check if all these rows are in the same block
        const blockRow = Math.floor(rows[0] / blockRows);
        if (rows.every(row => Math.floor(row / blockRows) === blockRow)) {
          // Remove this candidate from other cells in the same block
          let localChanged = false;
          for (let c = 0; c < blockCols; c++) {
            const curCol = blockCol * blockCols + c;
            if (curCol !== col) {
              for (let r = 0; r < blockRows; r++) {
                const curRow = blockRow * blockRows + r;
                if (board[curRow][curCol] === 0 && candidateMap[curRow][curCol].includes(num)) {
                  candidateMap[curRow][curCol] = candidateMap[curRow][curCol].filter(n => n !== num);
                  localChanged = true;
                }
              }
            }
          }
          if (localChanged) changed = true;
        }
      }
    }
  }
  
  return changed;
}

// Apply X-Wing technique
function applyXWing(board, candidateMap) {
  const n = board.length;
  let changed = false;
  
  // Check rows
  for (let num = 1; num <= n; num++) {
    const rowsWithCandidatePositions = [];
    
    for (let row = 0; row < n; row++) {
      const positions = [];
      for (let col = 0; col < n; col++) {
        if (board[row][col] === 0 && candidateMap[row][col].includes(num)) {
          positions.push(col);
        }
      }
      if (positions.length === 2) {
        rowsWithCandidatePositions.push({ row, cols: positions });
      }
    }
    
    // Look for matching pairs of rows
    for (let i = 0; i < rowsWithCandidatePositions.length; i++) {
      for (let j = i + 1; j < rowsWithCandidatePositions.length; j++) {
        const row1 = rowsWithCandidatePositions[i];
        const row2 = rowsWithCandidatePositions[j];
        
        if (row1.cols[0] === row2.cols[0] && row1.cols[1] === row2.cols[1]) {
          // X-Wing found! Eliminate candidates from other rows in these columns
          const col1 = row1.cols[0];
          const col2 = row1.cols[1];
          let localChanged = false;
          
          for (let row = 0; row < n; row++) {
            if (row !== row1.row && row !== row2.row) {
              for (const col of [col1, col2]) {
                if (board[row][col] === 0 && candidateMap[row][col].includes(num)) {
                  candidateMap[row][col] = candidateMap[row][col].filter(n => n !== num);
                  localChanged = true;
                }
              }
            }
          }
          
          if (localChanged) changed = true;
        }
      }
    }
  }
  
  // Check columns
  for (let num = 1; num <= n; num++) {
    const colsWithCandidatePositions = [];
    
    for (let col = 0; col < n; col++) {
      const positions = [];
      for (let row = 0; row < n; row++) {
        if (board[row][col] === 0 && candidateMap[row][col].includes(num)) {
          positions.push(row);
        }
      }
      if (positions.length === 2) {
        colsWithCandidatePositions.push({ col, rows: positions });
      }
    }
    
    // Look for matching pairs of columns
    for (let i = 0; i < colsWithCandidatePositions.length; i++) {
      for (let j = i + 1; j < colsWithCandidatePositions.length; j++) {
        const col1 = colsWithCandidatePositions[i];
        const col2 = colsWithCandidatePositions[j];
        
        if (col1.rows[0] === col2.rows[0] && col1.rows[1] === col2.rows[1]) {
          // X-Wing found! Eliminate candidates from other columns in these rows
          const row1 = col1.rows[0];
          const row2 = col1.rows[1];
          let localChanged = false;
          
          for (let col = 0; col < n; col++) {
            if (col !== col1.col && col !== col2.col) {
              for (const row of [row1, row2]) {
                if (board[row][col] === 0 && candidateMap[row][col].includes(num)) {
                  candidateMap[row][col] = candidateMap[row][col].filter(n => n !== num);
                  localChanged = true;
                }
              }
            }
          }
          
          if (localChanged) changed = true;
        }
      }
    }
  }
  
  return changed;
}

// Enhanced constraint propagation that applies all techniques
function enhancedConstraintPropagation(board) {
  const n = board.length;
  let candidateMap = createCandidateMap(board);
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 100; // Prevent infinite loops
  
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    
    // Apply techniques from simplest to most complex
    // This ordering maximizes efficiency
    changed = applyNakedSingles(board, candidateMap) || changed;
    
    // Update candidate map after each fill
    if (changed) {
      candidateMap = createCandidateMap(board);
      continue; // Restart with simplest technique
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
      continue;
    }
    
    changed = applyBoxLineReduction(board, candidateMap) || changed;
    
    if (changed) {
      candidateMap = createCandidateMap(board);
      continue;
    }
    
    // Most complex technique, only apply if others don't work
    changed = applyXWing(board, candidateMap) || changed;
    
    if (changed) {
      candidateMap = createCandidateMap(board);
    }
  }
  
  return board;
}

// Optimized naked singles constraint propagation (keeping original for compatibility)
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

// Enhanced backtracking solver that uses constraint propagation
function backtrackingSolver(board) {
  // First apply enhanced constraint propagation
  enhancedConstraintPropagation(board);
  
  // If the board is solved by constraint propagation alone, return early
  if (!findEmptyPosition(board)) {
    return true;
  }
  
  // Create candidate map for more efficient backtracking
  const candidateMap = createCandidateMap(board);
  
  // Find the most constrained position
  const pos = findBestEmptyPosition(board, candidateMap);
  if (!pos) {
    return true; // Puzzle solved
  }
  
  const [row, col] = pos;
  
  // Try candidates in order (already pre-filtered)
  for (const num of candidateMap[row][col]) {
    board[row][col] = num;
    
    // Deep copy the board for recursive calls to prevent side effects
    const boardCopy = board.map(r => [...r]);
    
    if (backtrackingSolver(boardCopy)) {
      // Copy back the solved values
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board.length; c++) {
          board[r][c] = boardCopy[r][c];
        }
      }
      return true;
    }
  }
  
  board[row][col] = 0; // Backtrack
  return false;
}

// Enhanced stochastic backtracking for distributed solving
function stochasticBacktrackingSolver(board, seed = Date.now()) {
  // First apply enhanced constraint propagation
  enhancedConstraintPropagation(board);
  
  // If the board is solved by constraint propagation alone, return early
  if (!findEmptyPosition(board)) {
    return true;
  }
  
  // Create candidate map for more efficient backtracking
  const candidateMap = createCandidateMap(board);
  
  // Find the most constrained position
  const pos = findBestEmptyPosition(board, candidateMap);
  if (!pos) {
    return true; // Puzzle solved
  }
  
  const [row, col] = pos;
  
  // Shuffle candidates using seed
  const candidates = [...candidateMap[row][col]];
  shuffleCandidates(candidates, seed + row * board.length + col);
  
  for (const num of candidates) {
    board[row][col] = num;
    if (stochasticBacktrackingSolver(board, seed + 1)) {
      return true;
    }
    board[row][col] = 0;
  }
  
  return false;
}

// Simple Fisher-Yates shuffle for candidate values
function shuffleCandidates(array, seed) {
  // Simple pseudo-random number generator
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Main solver - uses the enhanced approach
function solveSudoku(board, useStochastic = false) {
  // Create a deep copy of the board
  const boardCopy = board.map(row => [...row]);
  
  // First, apply enhanced constraint propagation
  enhancedConstraintPropagation(boardCopy);
  
  // If the board is already solved, return early
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

// Enhanced block solver for distributed processing
class SudokuBlockSolver {
  constructor(originalBoard, blockRow, blockCol) {
    // Initialize solver properties
    this.originalBoard = originalBoard.map(row => [...row]);
    this.size = originalBoard.length;
    const [blockRows, blockCols] = getBlockDimensions(this.size);
    this.blockRows = blockRows;
    this.blockCols = blockCols;
    this.blockRow = blockRow;
    this.blockCol = blockCol;
    this.startRow = blockRow * blockRows;
    this.startCol = blockCol * blockCols;
    
    // Extract the block data
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
    
    // Create seed for stochastic solving if needed
    this.seed = Date.now() + blockRow * 1000 + blockCol * 100;
  }
  
  // Create combined board with current block values
  getCombinedBoard() {
    const combined = this.originalBoard.map(row => [...row]);
    
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        combined[this.startRow + i][this.startCol + j] = this.block[i][j];
      }
    }
    
    return combined;
  }
  
  // Optimize block validation for speed
  isValidInBlock(i, j, num) {
    const globalRow = this.startRow + i;
    const globalCol = this.startCol + j;
    const combined = this.getCombinedBoard();
    return isValid(combined, globalRow, globalCol, num);
  }
  
  // Get candidates for a cell in the block
  getCandidatesForBlock(i, j) {
    if (this.block[i][j] !== 0) return [];
    
    const candidates = [];
    for (let num = 1; num <= this.size; num++) {
      if (this.isValidInBlock(i, j, num)) {
        candidates.push(num);
      }
    }
    return candidates;
  }
  
  // Create candidate map for the block
  createBlockCandidateMap() {
    const candidateMap = [];
    for (let i = 0; i < this.blockRows; i++) {
      candidateMap[i] = [];
      for (let j = 0; j < this.blockCols; j++) {
        candidateMap[i][j] = this.getCandidatesForBlock(i, j);
      }
    }
    return candidateMap;
  }
  
  // Apply enhanced constraint propagation to the block
  applyEnhancedBlockConstraintPropagation() {
    let candidateMap = this.createBlockCandidateMap();
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 50; // Limit iterations for blocks
    
    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;
      
      // Apply naked singles
      for (let i = 0; i < this.blockRows; i++) {
        for (let j = 0; j < this.blockCols; j++) {
          if (this.block[i][j] === 0 && candidateMap[i][j].length === 1) {
            this.block[i][j] = candidateMap[i][j][0];
            this.sure[i][j] = true; // Mark as certain
            candidateMap[i][j] = [];
            changed = true;
          }
        }
      }
      
      if (changed) {
        candidateMap = this.createBlockCandidateMap();
        continue;
      }
      
      // Apply hidden singles within the block
      const numPositionsInBlock = {};
      for (let i = 0; i < this.blockRows; i++) {
        for (let j = 0; j < this.blockCols; j++) {
          if (this.block[i][j] === 0) {
            candidateMap[i][j].forEach(num => {
              numPositionsInBlock[num] = (numPositionsInBlock[num] || []).concat([[i, j]]);
            });
          }
        }
      }
      
      for (const [num, positions] of Object.entries(numPositionsInBlock)) {
        if (positions.length === 1) {
          const [i, j] = positions[0];
          this.block[i][j] = parseInt(num);
          this.sure[i][j] = true; // Mark as certain
          candidateMap[i][j] = [];
          changed = true;
        }
      }
      
      if (changed) {
        candidateMap = this.createBlockCandidateMap();
      }
    }
  }
  
  // Solve the block with advanced techniques
  solve(useStochastic = true) {
    // First apply enhanced constraint propagation
    this.applyEnhancedBlockConstraintPropagation();
    
    // Get remaining empty positions
    const emptyPositions = [];
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        if (this.block[i][j] === 0) {
          emptyPositions.push([i, j]);
        }
      }
    }
    
    // If already solved, return the solution
    if (emptyPositions.length === 0) {
      return { block: this.block, sure: this.sure };
    }
    
    // Create candidate map for efficient backtracking
    const candidateMap = this.createBlockCandidateMap();
    
    // Find best position to try first (most constrained)
    let bestPos = null;
    let minCandidates = Infinity;
    
    for (const [i, j] of emptyPositions) {
      const candidateCount = candidateMap[i][j].length;
      if (candidateCount < minCandidates) {
        minCandidates = candidateCount;
        bestPos = [i, j];
        if (minCandidates === 1) break; // Found a cell with only one candidate
      }
    }
    
    // Replace first position with best position
    if (bestPos) {
      const idx = emptyPositions.findIndex(pos => pos[0] === bestPos[0] && pos[1] === bestPos[1]);
      if (idx > 0) {
        [emptyPositions[0], emptyPositions[idx]] = [emptyPositions[idx], emptyPositions[0]];
      }
    }
    
    // Solve remaining cells with backtracking
    if (useStochastic) {
      if (this.stochasticBacktrackBlock(emptyPositions, 0)) {
        return { block: this.block, sure: this.sure };
      }
    } else {
      if (this.backtrackBlock(emptyPositions, 0)) {
        return { block: this.block, sure: this.sure };
      }
    }
    
    return null;
  }
  
  // Fast deterministic backtracking for block
  backtrackBlock(positions, index) {
    if (index >= positions.length) {
      return true;
    }
    
    const [i, j] = positions[index];
    const candidates = this.getCandidatesForBlock(i, j);
    
    for (const num of candidates) {
      this.block[i][j] = num;
      
      if (this.backtrackBlock(positions, index + 1)) {
        return true;
      }
      
      this.block[i][j] = 0;
    }
    
    return false;
  }
  
  // Stochastic backtracking for block (for distributed solving)
  stochasticBacktrackBlock(positions, index) {
    if (index >= positions.length) {
      return true;
    }
    
    const [i, j] = positions[index];
    const candidates = this.getCandidatesForBlock(i, j);
    
    // Shuffle candidates
    shuffleCandidates(candidates, this.seed + i * 100 + j);
    
    for (const num of candidates) {
      this.block[i][j] = num;
      this.seed = (this.seed + 1) % Number.MAX_SAFE_INTEGER;
      
      if (this.stochasticBacktrackBlock(positions, index + 1)) {
        return true;
      }
      
      this.block[i][j] = 0;
    }
    
    return false;
  }
}

module.exports = {
  solveSudoku,
  getBlockDimensions,
  isValid,
  enhancedConstraintPropagation,
  StochasticBlockSolver: SudokuBlockSolver
};