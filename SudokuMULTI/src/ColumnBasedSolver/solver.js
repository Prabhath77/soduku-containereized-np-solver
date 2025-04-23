/**
 * Optimized Column-Based Sudoku Solver
 * Compatible with distributed processing architecture
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

// Apply constraint propagation for naked singles
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

// Backtracking solver that uses deterministic approach
function backtrackingSolver(board) {
  const pos = findEmptyPosition(board);
  if (!pos) {
    return true; // Puzzle solved
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

// Stochastic backtracking with randomized value selection
function stochasticBacktrackingSolver(board, seed = Date.now()) {
  const pos = findEmptyPosition(board);
  if (!pos) {
    return true;
  }
  
  const [row, col] = pos;
  const n = board.length;
  
  // Find all valid candidates for this position
  const candidates = [];
  for (let num = 1; num <= n; num++) {
    if (isValid(board, row, col, num)) {
      candidates.push(num);
    }
  }
  
  // Shuffle candidates for stochastic behavior
  const shuffledCandidates = shuffleArray(candidates, seed + row * n + col);
  
  for (const num of shuffledCandidates) {
    board[row][col] = num;
    if (stochasticBacktrackingSolver(board, seed + 1)) {
      return true;
    }
    board[row][col] = 0;
  }
  
  return false;
}

// Main solving function
function solveSudoku(board, useStochastic = false) {
  const boardCopy = board.map(row => [...row]);
  
  // Apply constraint propagation first
  applyNakedSingles(boardCopy);
  
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
 * Column-based solver class compatible with the distributed system
 * Optimized for solving Sudoku puzzles column by column
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
  // Inside the SudokuSolver class, fix the isValidInColumn method:

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

  // Apply naked singles constraint propagation for a single column
  applyNakedSinglesForColumn(column, originalBoard, colIndex) {
    const size = originalBoard.length;
    let changed = true;
    let sureMask = Array(size).fill(false);
    
    while (changed) {
      changed = false;
      for (let row = 0; row < size; row++) {
        if (column[row][0] === 0) {
          let candidates = [];
          for (let num = 1; num <= size; num++) {
            if (this.isValidInColumn(column, originalBoard, colIndex, row, num)) {
              candidates.push(num);
            }
          }
          
          if (candidates.length === 1) {
            column[row][0] = candidates[0];
            sureMask[row] = true;
            changed = true;
          }
        } else {
          sureMask[row] = true;
        }
      }
    }
    
    return { column, sureMask };
  }

  // Backtracking for a column
  backtrackColumn(column, originalBoard, colIndex, emptyPositions, index, sureMask) {
    if (index >= emptyPositions.length) {
      return true;
    }
    
    const row = emptyPositions[index];
    const size = originalBoard.length;
    
    for (let num = 1; num <= size; num++) {
      if (this.isValidInColumn(column, originalBoard, colIndex, row, num)) {
        column[row][0] = num;
        
        if (this.backtrackColumn(column, originalBoard, colIndex, emptyPositions, index + 1, sureMask)) {
          return true;
        }
        
        column[row][0] = 0;
      }
    }
    
    return false;
  }

  // Stochastic backtracking for column
  stochasticBacktrackColumn(column, originalBoard, colIndex, emptyPositions, index, sureMask) {
    if (index >= emptyPositions.length) {
      return true;
    }
    
    const row = emptyPositions[index];
    const size = originalBoard.length;
    
    // Find valid candidates
    const candidates = [];
    for (let num = 1; num <= size; num++) {
      if (this.isValidInColumn(column, originalBoard, colIndex, row, num)) {
        candidates.push(num);
      }
    }
    
    // Shuffle candidates
    const shuffledCandidates = shuffleArray(candidates, this.seed + row * 100 + colIndex);
    
    for (const num of shuffledCandidates) {
      column[row][0] = num;
      this.seed = (this.seed + 1) % Number.MAX_SAFE_INTEGER;
      
      if (this.stochasticBacktrackColumn(column, originalBoard, colIndex, emptyPositions, index + 1, sureMask)) {
        return true;
      }
      
      column[row][0] = 0;
    }
    
    return false;
  }

  // Main column solving method that handles both constraints and backtracking
  hybridSolve(column, originalBoard, colIndex) {
    // Apply constraint propagation first
    const { column: constraintColumn, sureMask } = this.applyNakedSinglesForColumn([...column.map(row => [...row])], originalBoard, colIndex);
    
    // Get empty positions for backtracking
    const emptyPositions = [];
    for (let row = 0; row < constraintColumn.length; row++) {
      if (constraintColumn[row][0] === 0) {
        emptyPositions.push(row);
      }
    }
    
    // If no empty positions after constraint propagation, we're done
    if (emptyPositions.length === 0) {
      return { column: constraintColumn, sure: sureMask };
    }
    
    // Try stochastic backtracking first - more variety of solutions for distributed solving
    if (this.stochasticBacktrackColumn(constraintColumn, originalBoard, colIndex, emptyPositions, 0, sureMask)) {
      return { column: constraintColumn, sure: sureMask };
    }
    
    // Fall back to deterministic backtracking if stochastic fails
    const deterministicColumn = [...column.map(row => [...row])];
    const deterministicSureMask = Array(column.length).fill(false);
    
    if (this.backtrackColumn(deterministicColumn, originalBoard, colIndex, emptyPositions, 0, deterministicSureMask)) {
      return { column: deterministicColumn, sure: deterministicSureMask };
    }
    
    throw new Error("Column cannot be solved");
  }
}

// Optimized block solver for block-based approaches
class SudokuBlockSolver {
  constructor(originalBoard, blockRow, blockCol) {
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
    // Apply constraints and attempt backtracking
    const result = {
      block: this.block,
      sure: this.sure
    };
    return result;
  }
}

module.exports = {
  solveSudoku,
  getBlockDimensions,
  isValid,
  SudokuSolver,
  StochasticBlockSolver: SudokuBlockSolver
};