// slave.js

const axios = require('axios');
const { SudokuSolver } = require('./solver');
const os = require('os');

const MASTER_URL = process.env.MASTER_URL || "http://localhost:3070";
const slaveId = `${os.hostname()}-${Math.floor(Math.random() * 10000)}`;
const solver = new SudokuSolver();

function sendHeartbeat() {
  axios.post(`${MASTER_URL}/heartbeat`, { slaveId })
    .catch(() => {});
}

async function processJob(job) {
  const { id, board } = job;
  const heartbeatInterval = setInterval(sendHeartbeat, 30000);
  
  try {
    const solution = solver.hybridSolve(board);
    await axios.post(`${MASTER_URL}/result`, { id, solvedBoard: solution });
  } catch (error) {
    await axios.post(`${MASTER_URL}/result`, { id, unsolvable: true, message: "Invalid puzzle" });
  } finally {
    clearInterval(heartbeatInterval);
  }
}

async function pollJobs() {
  while (true) {
    try {
      const response = await axios.get(`${MASTER_URL}/queue`, { params: { slaveId } });
      if (response.data) await processJob(response.data);
    } catch {} 
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

console.log(`Slave ${slaveId} started`);
pollJobs();