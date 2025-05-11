const express = require('express');
const http = require('http');
const cors = require('cors');
const { saveSolutionToFile } = require('./saveSolution');

const app = express();
const server = http.createServer(app);
const PORT = 3070;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased JSON payload limit for larger Sudoku boards

let jobQueue = [];
const completedJobs = {};
const pendingJobs = {}; // Tracks jobs currently assigned to slaves with metadata
const currentBlueprints = {}; // Stores the most recent state of each board for progress tracking
const slaveStatus = {}; // Keeps track of which slave nodes are active based on heartbeats

// Checks if an array contains duplicate non-zero values
function hasDuplicates(arr) {
  const filtered = arr.filter(x => x !== 0);
  return new Set(filtered).size !== filtered.length;
}

// Makes sure the Sudoku board has valid structure and doesn't violate any rules
function isValidGrid(board) {
  try {
    if (!Array.isArray(board) || board.length === 0) return false;
    const n = board.length;
    for (const row of board) {
      if (!Array.isArray(row) || row.length !== n) return false;
      for (const cell of row) {
        if (typeof cell !== 'number') return false;
      }
      if (hasDuplicates(row)) return false;
    }
    for (let col = 0; col < n; col++) {
      const colValues = [];
      for (let row = 0; row < n; row++) {
        colValues.push(board[row][col]);
      }
      if (hasDuplicates(colValues)) return false;
    }
    const blockSize = Math.sqrt(n);
    if (blockSize % 1 === 0) {
      for (let blockRow = 0; blockRow < blockSize; blockRow++) {
        for (let blockCol = 0; blockCol < blockSize; blockCol++) {
          const blockValues = [];
          for (let i = 0; i < blockSize; i++) {
            for (let j = 0; j < blockSize; j++) {
              blockValues.push(board[blockRow * blockSize + i][blockCol * blockSize + j]);
            }
          }
          if (hasDuplicates(blockValues)) return false;
        }
      }
    }
    return true;
  } catch (error) {
    console.error("Error validating grid:", error);
    return false;
  }
}

// Fills in obvious single-candidate cells to reduce the search space before sending to slaves
function applyNakedSinglesToBoard(board) {
  try {
    const n = board.length;
    let changed = true;

    // Checks if placing a number at a specific position would break Sudoku rules
    function isValid(board, row, col, num) {
      try {
        // Check row & column.
        for (let i = 0; i < n; i++) {
          if (board[row][i] === num || board[i][col] === num) return false;
        }
        // Check subgrid.
        const root = Math.sqrt(n);
        const boxRowStart = Math.floor(row / root) * root;
        const boxColStart = Math.floor(col / root) * root;
        for (let r = 0; r < root; r++) {
          for (let c = 0; c < root; c++) {
            if (board[boxRowStart + r][boxColStart + c] === num) return false;
          }
        }
        return true;
      } catch (error) {
        console.error(`Error in isValid at (${row}, ${col}):`, error);
        return false;
      }
    }

    // Keep applying naked singles until no more cells can be filled
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
  } catch (error) {
    console.error("Error in naked singles propagation:", error);
    return board; // Return unchanged board if error
  }
}

// Slaves ping this endpoint to show they're still alive and processing
app.post('/heartbeat', (req, res) => {
  try {
    const { slaveId } = req.body;
    if (!slaveId) return res.status(400).json({ error: 'slaveId is required.' });
    slaveStatus[slaveId] = Date.now();
    console.debug(`Received heartbeat from slave ${slaveId}`);
    res.sendStatus(200);
  } catch (error) {
    console.error("Error in heartbeat endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Frontend submits Sudoku boards here to start the solving process
app.post('/solve', (req, res) => {
  try {
    console.log("Received solve request");
    const { board } = req.body;
    
    if (!board || !Array.isArray(board)) {
      console.log("Invalid grid: Board is not an array.");
      return res.status(400).json({ error: 'Invalid board format.' });
    }
    
    if (!isValidGrid(board)) {
      console.log("Invalid grid received.");
      return res.status(400).json({ error: "Invalid grid." });
    }
    
    const jobId = Date.now().toString();
    console.log(`Processing job ${jobId} - creating copy of board`);
    
    // Create a safe deep copy of the board
    const boardCopy = JSON.parse(JSON.stringify(board));
    
    // Try to simplify the board by filling in obvious cells before distribution
    let partialBoard;
    try {
      partialBoard = applyNakedSinglesToBoard(boardCopy);
      console.log(`Applied naked singles to job ${jobId}`);
    } catch (err) {
      console.error(`Failed to apply naked singles for job ${jobId}:`, err);
      partialBoard = board.map(row => [...row]); // Simple deep copy as fallback
    }
    
    const job = { id: jobId, board: board.map(row => [...row]) };
    jobQueue.push(job);
    currentBlueprints[jobId] = partialBoard;
    
    console.log(`Job ${jobId} successfully enqueued.`);
    
    res.status(200).json({
      jobId,
      message: 'Job accepted and queued',
      partialBoard
    });
  } catch (error) {
    console.error("Error in /solve endpoint:", error);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
});

// Slaves call this endpoint when they're ready to take on a new job
app.get('/queue', (req, res) => {
  try {
    const slaveId = req.query.slaveId;
    if (!slaveId) return res.status(400).json({ error: 'slaveId is required as a query parameter.' });
    
    const job = jobQueue.shift();
    if (!job) return res.status(404).json({ error: 'No jobs available' });
    
    pendingJobs[job.id] = { job, slaveId, assignedAt: Date.now() };
    console.log(`Dispatching job ${job.id} to slave ${slaveId}.`);
    res.status(200).json(job);
  } catch (error) {
    console.error("Error in /queue endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Slaves submit their results here when they've solved (or failed to solve) a puzzle
app.post('/result', (req, res) => {
  try {
    const { id, solvedBoard, unsolvable, message } = req.body;
    
    if (!id || (solvedBoard === undefined && unsolvable !== true)) {
      return res.status(400).json({ error: 'Invalid payload.' });
    }
    
    if (pendingJobs[id]) delete pendingJobs[id];
    
    if (unsolvable) {
      console.log(`Job ${id} reported unsolvable: ${message}`);
      completedJobs[id] = [{ unsolvable: true, message }];
      currentBlueprints[id] = null;
      return res.status(200).json({ id, status: 'unsolvable' });
    }
    
    if (!completedJobs[id]) completedJobs[id] = [];
    
    // Avoid storing duplicate solutions for the same puzzle
    const exists = completedJobs[id].some(sol => JSON.stringify(sol) === JSON.stringify(solvedBoard));
    if (!exists) {
      completedJobs[id].push(solvedBoard);
      saveSolutionToFile(id, solvedBoard);
    } else {
      console.log(`Duplicate solution for job ${id} not saved.`);
    }
    
    // Update the current blueprint with the final solution
    currentBlueprints[id] = solvedBoard;
    
    console.log(`Job ${id} completed. Solution received.`);
    res.status(200).json({ id, status: 'completed' });
  } catch (error) {
    console.error("Error in /result endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Frontend can check progress by getting the latest state of the board
app.get('/grid/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const grid = currentBlueprints[jobId];
    
    if (grid) res.status(200).json({ jobId, partialBoard: grid });
    else res.status(404).json({ error: 'No grid update available.' });
  } catch (error) {
    console.error("Error in /grid endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Frontend uses this endpoint to retrieve a completed solution
app.get('/result/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const result = completedJobs[jobId];
    
    if (result && result.length > 0) {
      // Return the format the frontend expects
      res.status(200).json({ 
        jobId, 
        solvedBoard: result[0],  // Send first solution as solvedBoard
      });
    } else {
      res.status(404).json({ error: 'Result not ready or invalid jobId.' });
    }
  } catch (error) {
    console.error("Error in /result endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Catches any uncaught errors and provides a consistent response
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

// Monitoring process that handles failed slaves and reassigns their work
setInterval(() => {
  try {
    const now = Date.now();
    for (const [slaveId, lastHeartbeat] of Object.entries(slaveStatus)) {
      if (now - lastHeartbeat > 90000) { // 90 seconds without heartbeat means slave is dead
        console.warn(`Slave ${slaveId} missed heartbeat. Last seen: ${new Date(lastHeartbeat).toLocaleTimeString()}`);
        for (const [jobId, pending] of Object.entries(pendingJobs)) {
          if (pending.slaveId === slaveId) {
            console.warn(`Requeuing job ${jobId} assigned to dead slave ${slaveId}.`);
            jobQueue.push(pending.job);
            delete pendingJobs[jobId];
          }
        }
        delete slaveStatus[slaveId];
      }
    }
  } catch (error) {
    console.error("Error checking for dead slaves:", error);
  }
}, 60000); // Runs every minute to check slave status

server.listen(PORT, () => {
  console.log(`SingleStochastic master server running on port ${PORT}`);
});