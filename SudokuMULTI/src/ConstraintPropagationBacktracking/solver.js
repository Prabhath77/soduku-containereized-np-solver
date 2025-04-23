// Optimized solver combining speed with distributed processing capabilities

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

// Find the first empty position (simple, fast approach)
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

// Optimized naked singles constraint propagation
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

// Fast backtracking solver (deterministic)
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

// Optional stochastic backtracking for distributed solving
function stochasticBacktrackingSolver(board, seed = Date.now()) {
  const pos = findEmptyPosition(board);
  if (!pos) {
    return true;
  }
  
  const [row, col] = pos;
  const n = board.length;
  
  // Create array of candidate values
  const candidates = [];
  for (let num = 1; num <= n; num++) {
    if (isValid(board, row, col, num)) {
      candidates.push(num);
    }
  }
  
  // Shuffle candidates using seed
  shuffleCandidates(candidates, seed + row * n + col);
  
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

// Main solver - uses the fast approach
function solveSudoku(board, useStochastic = false) {
  // Create a deep copy of the board
  const boardCopy = board.map(row => [...row]);
  
  // First, apply naked singles constraint propagation
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

// Optimized block solver for distributed processing
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
  
  // Fast block solving using the optimized approach
  solve(useStochastic = true) {
    // Apply naked singles first
    this.applyBlockNakedSingles();
    
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
  
  // Optimized naked singles for a block
  applyBlockNakedSingles() {
    let changed = true;
    
    while (changed) {
      changed = false;
      
      for (let i = 0; i < this.blockRows; i++) {
        for (let j = 0; j < this.blockCols; j++) {
          if (this.block[i][j] === 0) {
            const candidates = [];
            
            for (let num = 1; num <= this.size; num++) {
              if (this.isValidInBlock(i, j, num)) {
                candidates.push(num);
              }
            }
            
            if (candidates.length === 1) {
              this.block[i][j] = candidates[0];
              this.sure[i][j] = true;
              changed = true;
            }
          }
        }
      }
    }
  }
  
  // Fast deterministic backtracking for block
  backtrackBlock(positions, index) {
    if (index >= positions.length) {
      return true;
    }
    
    const [i, j] = positions[index];
    
    for (let num = 1; num <= this.size; num++) {
      if (this.isValidInBlock(i, j, num)) {
        this.block[i][j] = num;
        
        if (this.backtrackBlock(positions, index + 1)) {
          return true;
        }
        
        this.block[i][j] = 0;
      }
    }
    
    return false;
  }
  
  // Stochastic backtracking for block (for distributed solving)
  stochasticBacktrackBlock(positions, index) {
    if (index >= positions.length) {
      return true;
    }
    
    const [i, j] = positions[index];
    const candidates = [];
    
    for (let num = 1; num <= this.size; num++) {
      if (this.isValidInBlock(i, j, num)) {
        candidates.push(num);
      }
    }
    
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
  StochasticBlockSolver: SudokuBlockSolver
};