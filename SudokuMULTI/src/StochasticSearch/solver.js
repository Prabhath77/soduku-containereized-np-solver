// Calculate the dimensions of each block in a Sudoku grid
function getBlockDimensions(n) {
  const root = Math.sqrt(n);
  if (Number.isInteger(root)) {
    return [root, root];
  } else {
    // For non-square grids, find the closest factors
    for (let i = Math.floor(Math.sqrt(n)); i >= 1; i--) {
      if (n % i === 0) {
        return [i, n / i];
      }
    }
    return [1, n]; // Fallback for prime numbers
  }
}

// Check if placing a number at given position would break sudoku rules
function isConsistent(board, row, col, value) {
  const n = board.length;
  
  // Check row
  for (let i = 0; i < n; i++) {
    if (board[row][i] === value) {
      return false;
    }
  }
  
  // Check column
  for (let i = 0; i < n; i++) {
    if (board[i][col] === value) {
      return false;
    }
  }
  
  // Check block
  const [blockRows, blockCols] = getBlockDimensions(n);
  const blockRowStart = Math.floor(row / blockRows) * blockRows;
  const blockColStart = Math.floor(col / blockCols) * blockCols;
  
  for (let i = 0; i < blockRows; i++) {
    for (let j = 0; j < blockCols; j++) {
      if (board[blockRowStart + i][blockColStart + j] === value) {
        return false;
      }
    }
  }
  
  return true;
}

// Get all valid candidates for a cell based on Sudoku constraints
function getCandidates(board, row, col) {
  if (board[row][col] !== 0) {
    return [];
  }
  
  const n = board.length;
  const candidates = [];
  
  for (let num = 1; num <= n; num++) {
    if (isConsistent(board, row, col, num)) {
      candidates.push(num);
    }
  }
  
  return candidates;
}

// Apply only naked singles constraint propagation
function enhancedConstraintPropagation(board) {
  const n = board.length;
  const MAX_ITERATIONS = 100;
  
  // Create a deep copy of the board to work with
  const workingBoard = board.map(row => [...row]);
  
  let changed = true;
  let iterations = 0;
  
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    
    // Apply naked singles technique only
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (workingBoard[i][j] === 0) {
          const candidates = getCandidates(workingBoard, i, j);
          if (candidates.length === 1) {
            workingBoard[i][j] = candidates[0];
            changed = true;
          }
        }
      }
    }
  }
  
  // Update the original board with our changes
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      board[i][j] = workingBoard[i][j];
    }
  }
  
  return board;
}

// Solver class that uses randomized search techniques with naked singles only
class OptimizedStochasticBlockSolver {
  constructor(fullBoard, blockRow, blockCol, referenceBoard = null) {
    this.fullBoard = fullBoard;
    this.blockRow = blockRow;
    this.blockCol = blockCol;
    
    // Extract dimensions
    const n = fullBoard.length;
    const [blockRows, blockCols] = getBlockDimensions(n);
    this.blockSize = blockRows * blockCols;
    this.blockRows = blockRows;
    this.blockCols = blockCols;
    
    // Extract our block from the full board
    this.block = Array(blockRows).fill().map(() => Array(blockCols).fill(0));
    this.fixed = Array(blockRows).fill().map(() => Array(blockCols).fill(false));
    this.sureMask = Array(blockRows).fill().map(() => Array(blockCols).fill(false));
    this.nakedSingles = Array(blockRows).fill().map(() => Array(blockCols).fill(false));
    
    // Copy block data from the full board
    for (let i = 0; i < blockRows; i++) {
      for (let j = 0; j < blockCols; j++) {
        const fullRow = blockRow * blockRows + i;
        const fullCol = blockCol * blockCols + j;
        if (fullRow < n && fullCol < n) {
          this.block[i][j] = fullBoard[fullRow][fullCol];
          if (this.block[i][j] !== 0) {
            this.fixed[i][j] = true;
            this.sureMask[i][j] = true;  // Original values are always "sure"
          }
        }
      }
    }
    
    // Reference full board for context (if provided)
    this.referenceBoard = referenceBoard || fullBoard;
    
    // Initialize with basic missing values
    this.initializeMissingValues();
  }
  
  // Get a list of candidate values for a cell in our block
  getCandidates(i, j) {
    if (this.fixed[i][j]) return [];
    
    const fullRow = this.blockRow * this.blockRows + i;
    const fullCol = this.blockCol * this.blockCols + j;
    const candidates = [];
    
    for (let value = 1; value <= this.blockSize; value++) {
      // Skip if this value already exists in our block
      let exists = false;
      for (let bi = 0; bi < this.blockRows; bi++) {
        for (let bj = 0; bj < this.blockCols; bj++) {
          if (this.block[bi][bj] === value) {
            exists = true;
            break;
          }
        }
        if (exists) break;
      }
      
      if (!exists && isConsistent(this.referenceBoard, fullRow, fullCol, value)) {
        candidates.push(value);
      }
    }
    
    return candidates;
  }
  
  // Fill in missing values randomly to start
  initializeMissingValues() {
    const availableValues = new Set();
    for (let v = 1; v <= this.blockSize; v++) {
      availableValues.add(v);
    }
    
    // Remove values that are already in the block
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        if (this.block[i][j] > 0) {
          availableValues.delete(this.block[i][j]);
        }
      }
    }
    
    // Convert to array for easy access
    const values = Array.from(availableValues);
    
    // Fill empty cells with remaining values
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        if (this.block[i][j] === 0) {
          const candidates = this.getCandidates(i, j);
          if (candidates.length > 0) {
            // Use a candidate if possible
            this.block[i][j] = candidates[Math.floor(Math.random() * candidates.length)];
            this.sureMask[i][j] = false;  // Values filled randomly are not "sure"
          } else if (values.length > 0) {
            // Otherwise use a remaining value
            const idx = Math.floor(Math.random() * values.length);
            this.block[i][j] = values[idx];
            values.splice(idx, 1);
            this.sureMask[i][j] = false;  // Values filled randomly are not "sure"
          }
        }
      }
    }
  }
  
  // Calculate how "good" our current solution is (0 = perfect)
  energy() {
    let conflicts = 0;
    
    // Check for duplicate values in block
    const seen = new Set();
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        const value = this.block[i][j];
        if (value > 0) {
          if (seen.has(value)) {
            conflicts++;
          } else {
            seen.add(value);
          }
        } else {
          conflicts++; // Empty cell is also a conflict
        }
      }
    }
    
    // Check for inconsistencies with the full board
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        const fullRow = this.blockRow * this.blockRows + i;
        const fullCol = this.blockCol * this.blockCols + j;
        const value = this.block[i][j];
        
        if (value > 0 && !isConsistent(this.referenceBoard, fullRow, fullCol, value)) {
          conflicts++;
        }
      }
    }
    
    return conflicts;
  }
  
  // Try to directly assign a value to a cell
  tryDirectAssignment(pos) {
    const { i, j } = pos;
    const currentVal = this.block[i][j];
    let bestVal = currentVal;
    let bestEnergy = this.energy();
    const candidates = this.getCandidates(i, j);
    
    for (const cand of candidates) {
      this.block[i][j] = cand;
      const eng = this.energy();
      if (eng < bestEnergy) {
        bestEnergy = eng;
        bestVal = cand;
      }
    }
    
    this.block[i][j] = bestVal;
    
    // Values filled by stochastic search are never "sure"
    if (bestVal !== 0 && bestVal !== currentVal && !this.fixed[i][j] && !this.nakedSingles[i][j]) {
      this.sureMask[i][j] = false;
    }
    
    return bestEnergy;
  }
  
  // Swap values between two positions
  _swap(pos1, pos2) {
    const temp = this.block[pos1.i][pos1.j];
    this.block[pos1.i][pos1.j] = this.block[pos2.i][pos2.j];
    this.block[pos2.i][pos2.j] = temp;
    
    // Values involved in swaps are never "sure"
    this.sureMask[pos1.i][pos1.j] = this.fixed[pos1.i][pos1.j] || this.nakedSingles[pos1.i][pos1.j];
    this.sureMask[pos2.i][pos2.j] = this.fixed[pos2.i][pos2.j] || this.nakedSingles[pos2.i][pos2.j];
  }
  
  // Try swapping values to find better solutions
  trySwap() {
    // Find non-fixed cells that we can swap
    const swappable = [];
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        if (!this.fixed[i][j]) {
          swappable.push({ i, j });
        }
      }
    }
    
    if (swappable.length < 2) return this.energy();
    
    // Try random swaps
    const currentEnergy = this.energy();
    const numSwaps = Math.min(10, Math.floor(swappable.length / 2));
    
    for (let attempt = 0; attempt < numSwaps; attempt++) {
      const idx1 = Math.floor(Math.random() * swappable.length);
      let idx2 = Math.floor(Math.random() * swappable.length);
      while (idx2 === idx1) {
        idx2 = Math.floor(Math.random() * swappable.length);
      }
      
      const pos1 = swappable[idx1];
      const pos2 = swappable[idx2];
      
      // Don't swap fixed cells
      if (this.fixed[pos1.i][pos1.j] || this.fixed[pos2.i][pos2.j]) continue;
      
      this._swap(pos1, pos2);
      const newEnergy = this.energy();
      
      // If this swap didn't help, swap back
      if (newEnergy > currentEnergy) {
        this._swap(pos1, pos2);
      }
    }
    
    return this.energy();
  }
  
  // Apply naked singles constraint propagation
  applyNakedSingles() {
    let changed = false;
    
    do {
      changed = false;
      
      for (let i = 0; i < this.blockRows; i++) {
        for (let j = 0; j < this.blockCols; j++) {
          if (this.block[i][j] === 0) {
            const candidates = this.getCandidates(i, j);
            if (candidates.length === 1) {
              this.block[i][j] = candidates[0];
              this.sureMask[i][j] = true;  // Naked singles are "sure"
              this.nakedSingles[i][j] = true; // Mark as naked single
              changed = true;
            }
          }
        }
      }
    } while (changed);
  }
  
  // Main solve method
  solve() {
    // First apply naked singles - these values are "sure"
    this.applyNakedSingles();
    
    // If our energy is already 0, we're done
    if (this.energy() === 0) {
      return { block: this.block, sure: this.sureMask };
    }
    
    // Otherwise try stochastic search
    const MAX_ITERATIONS = 1000;
    const MAX_RESTARTS = 10;
    
    let iteration = 0;
    let bestEnergy = this.energy();
    let bestBlock = this.block.map(row => [...row]);
    let bestSureMask = this.sureMask.map(row => [...row]);
    
    for (let restart = 0; restart < MAX_RESTARTS; restart++) {
      // Reset if we're restarting
      if (restart > 0) {
        this.initializeMissingValues();
        this.applyNakedSingles();
      }
      
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        iteration++;
        
        // First try direct assignments
        for (let row = 0; row < this.blockRows; row++) {
          for (let col = 0; col < this.blockCols; col++) {
            if (!this.fixed[row][col]) {
              this.tryDirectAssignment({ i: row, j: col });
            }
          }
        }
        
        // Then try swaps
        this.trySwap();
        
        const curEnergy = this.energy();
        if (curEnergy < bestEnergy) {
          bestEnergy = curEnergy;
          bestBlock = this.block.map(row => [...row]);
          bestSureMask = this.sureMask.map(row => [...row]);
          
          if (bestEnergy === 0) {
            // Found a perfect solution
            this.block = bestBlock;
            this.sureMask = bestSureMask;
            break;
          }
        }
      }
      
      if (bestEnergy === 0) break;
    }
    
    // Use our best found solution
    this.block = bestBlock;
    this.sureMask = bestSureMask;
    
    // Final check: Make sure anything not fixed or a naked single is marked as unsure
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        if (this.block[i][j] !== 0 && !this.fixed[i][j] && !this.nakedSingles[i][j]) {
          // Values from stochastic search are never "sure"
          this.sureMask[i][j] = false;
        }
      }
    }
    
    console.log(`Block solved after ${iteration} iterations with energy ${this.energy()}`);
    return { block: this.block, sure: this.sureMask };
  }
}

module.exports = {
  getBlockDimensions,
  isConsistent,
  enhancedConstraintPropagation,
  StochasticBlockSolver: OptimizedStochasticBlockSolver
};