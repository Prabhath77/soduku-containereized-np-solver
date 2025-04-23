const fs = require('fs');
const path = require('path');

// Define the directory where solutions will be saved
const solutionsDir = './SaveSolutions';

// Create the solutions directory if it doesn't exist
if (!fs.existsSync(solutionsDir)) {
  fs.mkdirSync(solutionsDir, { recursive: true });
}

function saveSolutionToFile(jobId, solvedBoard) {
  // Convert each row of the Sudoku board to comma-separated strings for storage
  const formattedBoard = solvedBoard.map(row => row.join(','));
  
  // Create a data object containing the job ID, formatted board, and current timestamp
  const solutionData = {
    jobId,
    solvedBoard: formattedBoard,
    timestamp: new Date().toISOString()
  };
  
  // Generate a unique filename using the job ID and current timestamp
  const filename = `solution_${jobId}_${Date.now()}.json`;
  const filePath = path.join(solutionsDir, filename);
  
  // Write the solution data to a JSON file and handle any errors
  fs.writeFile(filePath, JSON.stringify(solutionData, null, 2), (err) => {
    if (err) console.error('Error saving solution to file:', err);
    else console.log('Solution saved to file:', filePath);
  });
}

// Export the function so it can be used in other files
module.exports = { saveSolutionToFile };