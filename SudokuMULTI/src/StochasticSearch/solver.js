// Calculate the height and width of each block in the sudoku grid based on grid size
function getBlockDimensions(n) {
  const root = Math.sqrt(n);
  if (Number.isInteger(root)) {
    return [root, root];
  } else {
    throw new Error("Grid size must be a perfect square");
  }
}

// Check if placing a number at given position would break sudoku rules
function isConsistent(board, row, col, value) {
  const n = board.length;
  for (let i = 0; i < n; i++) {
    if (board[row][i] === value) return false;
    if (board[i][col] === value) return false;
  }
  const [blockRows, blockCols] = getBlockDimensions(n);
  const blockRowStart = Math.floor(row / blockRows) * blockRows;
  const blockColStart = Math.floor(col / blockCols) * blockCols;
  for (let i = 0; i < blockRows; i++) {
    for (let j = 0; j < blockCols; j++) {
      if (board[blockRowStart + i][blockColStart + j] === value) return false;
    }
  }
  return true;
}

// Solver class that uses randomized search techniques to solve one block of a sudoku puzzle
class OptimizedStochasticBlockSolver {
  // Set up the solver with the specific block to be solved
  constructor(originalBoard, blockRow, blockCol) {
    this.originalBoard = originalBoard;
    this.size = originalBoard.length;
    const [blockRows, blockCols] = getBlockDimensions(this.size);
    this.blockRows = blockRows;
    this.blockCols = blockCols;
    this.blockRow = blockRow;
    this.blockCol = blockCol;
    this.startRow = blockRow * blockRows;
    this.startCol = blockCol * blockCols;
    this.block = [];
    this.fixed = [];
    this.sureMask = [];
    for (let i = 0; i < blockRows; i++) {
      const row = [];
      const fixRow = [];
      const sureRow = [];
      for (let j = 0; j < blockCols; j++) {
        const val = originalBoard[this.startRow + i][this.startCol + j];
        row.push(val);
        const isFixed = val !== 0;
        fixRow.push(isFixed);
        sureRow.push(isFixed);
      }
      this.block.push(row);
      this.fixed.push(fixRow);
      this.sureMask.push(sureRow);
    }
    this.nonFixedPositions = [];
    for (let i = 0; i < blockRows; i++) {
      for (let j = 0; j < blockCols; j++) {
        if (!this.fixed[i][j]) {
          this.nonFixedPositions.push({ i, j });
        }
      }
    }
    this.temperature = 1.0;
    this.coolingRate = 0.993;
    this.maxIterations = 10000;
    this.restartThreshold = 1000;
  }
  
  // Find all possible values that can go in a cell based on row, column, and block constraints
  getCandidates(i, j) {
    const candidates = new Set();
    for (let d = 1; d <= this.size; d++) {
      candidates.add(d);
    }
    const globalRow = this.startRow + i;
    for (let c = 0; c < this.size; c++) {
      candidates.delete(this.originalBoard[globalRow][c]);
    }
    const globalCol = this.startCol + j;
    for (let r = 0; r < this.size; r++) {
      candidates.delete(this.originalBoard[r][globalCol]);
    }
    for (let a = 0; a < this.blockRows; a++) {
      for (let b = 0; b < this.blockCols; b++) {
        candidates.delete(this.block[a][b]);
      }
    }
    return Array.from(candidates);
  }
  
  // Fill in cells that only have one possible value (simple strategy)
  applyNakedSingles() {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < this.blockRows; i++) {
        for (let j = 0; j < this.blockCols; j++) {
          if (this.block[i][j] === 0) {
            const candidates = this.getCandidates(i, j);
            if (candidates.length === 1) {
              this.block[i][j] = candidates[0];
              this.sureMask[i][j] = true;
              changed = true;
            }
          }
        }
      }
    }
  }
  
  // Update the list of empty cells in the block
  updateEmptyPositions() {
    this.nonFixedPositions = [];
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        if (this.block[i][j] === 0) {
          this.nonFixedPositions.push({ i, j });
        }
      }
    }
  }
  
  // Calculate how many rules are currently violated in the block
  energy() {
    let conflicts = 0;
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        if (this.block[i][j] === 0) conflicts += 5;
      }
    }
    const freq = {};
    for (let i = 0; i < this.blockRows; i++) {
      for (let j = 0; j < this.blockCols; j++) {
        const v = this.block[i][j];
        if (v !== 0) {
          freq[v] = (freq[v] || 0) + 1;
        }
      }
    }
    for (const v in freq) {
      if (freq[v] > 1) conflicts += (freq[v] - 1);
    }
    return conflicts;
  }
  
  // Test different values for a cell and pick the one that causes least conflicts
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
    return bestEnergy;
  }
  
  // Exchange values between two positions in the block
  _swap(pos1, pos2) {
    const temp = this.block[pos1.i][pos1.j];
    this.block[pos1.i][pos1.j] = this.block[pos2.i][pos2.j];
    this.block[pos2.i][pos2.j] = temp;
  }
  
  // Main solving algorithm using simulated annealing (gradually reducing randomness)
  solve() {
    this.applyNakedSingles();
    this.updateEmptyPositions();
    let totalConflicts = this.energy();
    let iteration = 0;
    let noImprovement = 0;
    let bestEnergy = totalConflicts;
    let temperature = this.temperature;
    
    while (iteration < this.maxIterations && totalConflicts > 0) {
      iteration++;
      let pos;
      if (this.nonFixedPositions.length > 0) {
        pos = this.nonFixedPositions[Math.floor(Math.random() * this.nonFixedPositions.length)];
      } else {
        break;
      }
      
      const energyBefore = this.energy();
      const newEnergy = this.tryDirectAssignment(pos);
      const delta = energyBefore - newEnergy;
      
      if (delta > 0 || Math.random() < Math.exp(delta / temperature)) {
        totalConflicts = this.energy();
        noImprovement = 0;
      } else {
        noImprovement++;
      }
      
      // Try swapping two cells occasionally to escape dead-end situations
      if (Math.random() < 0.2 && this.nonFixedPositions.length >= 2) {
        const idx1 = Math.floor(Math.random() * this.nonFixedPositions.length);
        let idx2 = Math.floor(Math.random() * this.nonFixedPositions.length);
        while (idx2 === idx1) {
          idx2 = Math.floor(Math.random() * this.nonFixedPositions.length);
        }
        this._swap(this.nonFixedPositions[idx1], this.nonFixedPositions[idx2]);
        const swapEnergy = this.energy();
        if (swapEnergy < totalConflicts) {
          totalConflicts = swapEnergy;
          noImprovement = 0;
        } else {
          this._swap(this.nonFixedPositions[idx1], this.nonFixedPositions[idx2]);
          noImprovement++;
        }
      }
      
      temperature *= this.coolingRate;
      
      if (iteration % 1000 === 0) {
        console.log(`Iteration ${iteration}, Block Energy: ${totalConflicts}`);
      }
      
      if (totalConflicts < bestEnergy) {
        bestEnergy = totalConflicts;
        noImprovement = 0;
      } else {
        noImprovement++;
      }
      
      // If stuck for too long, randomly fill empty cells and try again
      if (noImprovement > this.restartThreshold && totalConflicts > 0) {
        console.log(`Restarting unsolved cells after ${noImprovement} iterations.`);
        for (const pos of this.nonFixedPositions) {
          if (this.block[pos.i][pos.j] === 0) {
            const candidates = this.getCandidates(pos.i, pos.j);
            if (candidates.length > 0) {
              this.block[pos.i][pos.j] = candidates[Math.floor(Math.random() * candidates.length)];
              this.sureMask[pos.i][pos.j] = false;
            }
          }
        }
        totalConflicts = this.energy();
        noImprovement = 0;
        temperature = this.temperature;
      }
      
      this.updateEmptyPositions();
    }
    
    console.log(`Block solved after ${iteration} iterations with energy ${totalConflicts}`);
    return { block: this.block, sure: this.sureMask };
  }
  
  // Display the current state of the block for debugging
  printBlock() {
    for (let i = 0; i < this.blockRows; i++) {
      console.log(this.block[i].join(" "));
    }
  }
}

module.exports = {
  getBlockDimensions,
  isConsistent,
  StochasticBlockSolver: OptimizedStochasticBlockSolver
};