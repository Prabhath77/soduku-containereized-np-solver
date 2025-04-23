document.addEventListener('DOMContentLoaded', () => {
    console.log("Document loaded and ready");
    
    // DOM Elements
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const algorithmCards = document.querySelectorAll('.algorithm-card');
    const progressSection = document.getElementById('progress-section');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const downloadSection = document.getElementById('download-section');
    const downloadButton = document.getElementById('download-all-button');
    const gridVisualizer = document.getElementById('grid-visualizer');
    const solvingTimeElement = document.getElementById('solving-time');
    const gridSizeElement = document.getElementById('grid-size');
    const solutionStatusElement = document.getElementById('solution-status');
    const currentSolverElement = document.getElementById('current-solver');
    
    // State
    let uploadedFile = null;
    let sudokuData = null;
    let selectedSolvers = [];
    let solverResults = {};
    let activeJobs = {};
    let pollingIntervals = {};
    
    // Initialize UI
    if (progressSection) progressSection.style.display = 'none';
    if (downloadSection) downloadSection.style.display = 'none';
    
    // File upload - click handling
    if (uploadArea) {
        uploadArea.addEventListener('click', () => {
            console.log("Upload area clicked");
            if (fileInput) fileInput.click();
        });
    }
    
    // File upload - file selection handling
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            console.log("File input changed", event.target.files);
            const file = event.target.files[0];
            if (file) {
                console.log("Selected file:", file.name, file.type);
                processFile(file);
            }
        });
    }
    
    // File upload - drag and drop handling
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (event) => {
            event.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const file = event.dataTransfer.files[0];
            if (file) {
                processFile(file);
            }
        });
    }
    
    // Process the uploaded file
    function processFile(file) {
        uploadedFile = file;
        
        // Validate file type
        if (!file.name.endsWith('.json') && file.type !== 'application/json') {
            if (fileInfo) {
                fileInfo.className = 'file-info error';
                fileInfo.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please upload a JSON file';
            }
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                console.log("JSON parsed successfully");
                
                // Validate the data structure
                if (!Array.isArray(data) || !data.every(row => Array.isArray(row))) {
                    throw new Error('Invalid Sudoku format. Expected 2D array.');
                }
                
                // Store data and update UI
                sudokuData = data;
                if (fileInfo) {
                    fileInfo.className = 'file-info success';
                    fileInfo.innerHTML = `<i class="fas fa-check-circle"></i> File loaded: ${file.name}`;
                }
                
                // Update solve button state
                updateSolveButtonState();
                
            } catch (error) {
                console.error("JSON parsing error:", error);
                if (fileInfo) {
                    fileInfo.className = 'file-info error';
                    fileInfo.innerHTML = `<i class="fas fa-exclamation-circle"></i> Invalid JSON format: ${error.message}`;
                }
            }
        };
        
        reader.onerror = () => {
            if (fileInfo) {
                fileInfo.className = 'file-info error';
                fileInfo.innerHTML = '<i class="fas fa-exclamation-circle"></i> Error reading file';
            }
        };
        
        reader.readAsText(file);
    }
    
    // Algorithm selection - Only toggle selection, don't solve immediately
    algorithmCards.forEach(card => {
        card.addEventListener('click', () => {
            const solver = card.dataset.solver;
            console.log("Algorithm clicked:", solver);
            toggleAlgorithm(solver, card);
        });
    });
    
    // Toggle algorithm selection - Just handle toggling, no solving
    function toggleAlgorithm(algorithm, card) {
        const index = selectedSolvers.indexOf(algorithm);
        
        if (index === -1) {
            // Add solver to selection
            selectedSolvers.push(algorithm);
            card.classList.add('selected');
            console.log("Selected algorithm:", algorithm);
        } else {
            // Remove solver from selection if not currently solving
            if (!activeJobs[algorithm]) {
                selectedSolvers.splice(index, 1);
                card.classList.remove('selected');
                console.log("Unselected algorithm:", algorithm);
            }
        }
        
        console.log("Current selections:", selectedSolvers);
        updateSolveButtonState();
    }
    
    // Update solve button state
    function updateSolveButtonState() {
        const algorithmSection = document.querySelector('.algorithm-section');
        if (!algorithmSection) return;
        
        let solveButton = document.getElementById('solve-button');
        
        // Create button container if it doesn't exist
        if (!solveButton) {
            console.log("Creating solve button...");
            
            // Create button container
            let buttonContainer = document.querySelector('.algorithm-section > .button-container');
            if (!buttonContainer) {
                buttonContainer = document.createElement('div');
                buttonContainer.className = 'button-container';
                buttonContainer.style.textAlign = 'center';
                buttonContainer.style.marginTop = '20px';
                algorithmSection.appendChild(buttonContainer);
            }
            
            // Create the button
            solveButton = document.createElement('button');
            solveButton.id = 'solve-button';
            solveButton.className = 'solve-button';
            solveButton.innerHTML = '<i class="fas fa-play"></i> Solve with Selected Algorithms';
            
            // Add click event
            solveButton.addEventListener('click', solveWithSelected);
            
            // Add to container
            buttonContainer.appendChild(solveButton);
        }
        
        // Update button state
        if (solveButton) {
            solveButton.disabled = !sudokuData || selectedSolvers.length === 0;
            console.log(`Solve button state: ${!solveButton.disabled ? 'enabled' : 'disabled'}`);
        }
    }
    
    // Solve with selected algorithms
    function solveWithSelected() {
        if (!sudokuData || selectedSolvers.length === 0) {
            console.log("Cannot solve: no data or no solvers selected");
            return;
        }
        
        console.log(`Starting solve with ${selectedSolvers.length} algorithms:`, selectedSolvers);
        
        if (progressSection) {
            progressSection.style.display = 'block';
        }
        
        // Create progress trackers FIRST
        createProgressTrackers();
        
        // THEN start solving with each selected algorithm
        selectedSolvers.forEach(solver => {
            solveSudoku(sudokuData, solver);
        });
    }
    
    // Create progress trackers for all selected solvers
    function createProgressTrackers() {
        const progressContainer = document.getElementById('solver-progress-container');
        if (!progressContainer) return;
        
        console.log("Creating progress trackers for", selectedSolvers.length, "solvers");
        progressContainer.innerHTML = '';
        
        selectedSolvers.forEach(solver => {
            const solverProgress = document.createElement('div');
            solverProgress.className = 'solver-progress';
            solverProgress.innerHTML = `
                <h4>${getSolverName(solver)}</h4>
                <div class="progress-bar-container">
                    <div id="progress-bar-${solver}" class="progress-bar"></div>
                </div>
                <div id="progress-status-${solver}" class="progress-status">Initializing...</div>
            `;
            progressContainer.appendChild(solverProgress);
            console.log(`Progress tracker created for ${solver}`);
        });
    }
    
    // Get friendly name for solver
    function getSolverName(solverKey) {
        const names = {
            'constraint-propagation': 'Constraint Propagation',
            'column-based': 'Column-Based',
            'multi-stochastic': 'Multi-Stochastic',
            'backtracking': 'Backtracking',
            'rule-based': 'Rule-Based',
            'single-stochastic': 'Single-Stochastic'
        };
        return names[solverKey] || solverKey;
    }
    
    // Send puzzle to solver
    async function solveSudoku(board, algorithmType) {
        console.log(`Starting to solve with ${algorithmType}`);
        try {
            const progressBar = document.getElementById(`progress-bar-${algorithmType}`);
            const progressStatus = document.getElementById(`progress-status-${algorithmType}`);
            
            // Safe element updates with null checks
            if (progressStatus) {
                progressStatus.textContent = 'Sending puzzle to solver...';
                console.log(`Updated status for ${algorithmType}`);
            } else {
                console.warn(`Progress status element for ${algorithmType} not found!`);
            }
            
            if (progressBar) {
                progressBar.style.width = '10%';
            } else {
                console.warn(`Progress bar element for ${algorithmType} not found!`);
            }
            
            // Record start time
            const solveStartTime = Date.now();
            activeJobs[algorithmType] = { startTime: solveStartTime };
            
            // Get endpoint from config
            const solverEndpoint = config.solverEndpoints[algorithmType];
            console.log(`Using endpoint ${solverEndpoint} for ${algorithmType}`);
            
            const response = await fetch(solverEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ board })
            });
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`Response received from ${algorithmType}`);

            // Check if we got a jobId
            if (!data.jobId) {
                throw new Error('No job ID returned from solver');
            }

            // Start polling for results
            const jobId = data.jobId;
            activeJobs[algorithmType].jobId = jobId;
            console.log(`Got jobId ${jobId} for ${algorithmType}`);
            
            if (progressStatus) {
                progressStatus.textContent = 'Waiting for solver to finish...';
            }
            
            if (progressBar) {
                progressBar.style.width = '30%';
            }
            
            startPolling(algorithmType, jobId);
            
        } catch (error) {
            console.error(`Error with ${algorithmType}:`, error);
            
            const progressStatus = document.getElementById(`progress-status-${algorithmType}`);
            const progressBar = document.getElementById(`progress-bar-${algorithmType}`);
            
            if (progressStatus) {
                progressStatus.textContent = `Error: ${error.message}`;
            }
            
            if (progressBar) {
                progressBar.style.width = '0%';
            }
            
            delete activeJobs[algorithmType];
        }
    }

// Poll for results with no timeout limit
function startPolling(algorithmType, jobId) {
    if (pollingIntervals[algorithmType]) {
        clearInterval(pollingIntervals[algorithmType]);
    }
    
    let attempts = 0;
    // Removed maxAttempts limit
    
    pollingIntervals[algorithmType] = setInterval(async () => {
        attempts++;
        const progressBar = document.getElementById(`progress-bar-${algorithmType}`);
        const progressStatus = document.getElementById(`progress-status-${algorithmType}`);
        
        // Removed timeout check that was here
        
        try {
            const endpoint = `/api/result/${algorithmType}/${jobId}`;
            console.log(`Polling ${endpoint} - attempt ${attempts}`);
            
            const response = await fetch(endpoint);
            
            // If not ready, continue polling
            if (response.status === 404) {
                // Calculate progress differently without a max limit
                const progress = Math.min(30 + Math.log(attempts + 1) * 15, 90);
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressStatus) progressStatus.textContent = `Waiting for solver to finish... (${attempts}s)`;
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Failed to get results: ${response.status}`);
            }
            
            // Try to parse response as JSON
            const result = await response.json();
            
            if (result.status === 'processing') {
                const progress = Math.min(30 + Math.log(attempts + 1) * 15, 90);
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (progressStatus) progressStatus.textContent = `Waiting for solver to finish... (${attempts}s)`;
                return;
            }
            
            // Success! We have a result
            clearInterval(pollingIntervals[algorithmType]);
            delete pollingIntervals[algorithmType];
            
            // Calculate solving time
            const solveEndTime = Date.now();
            const solvingTime = (solveEndTime - activeJobs[algorithmType].startTime) / 1000;
            
            // Store result with expected format
            solverResults[algorithmType] = {
                solvedBoard: result.solvedBoard || result.board,
                time: solvingTime,
                status: result.status || "Completed",
                solver: algorithmType
            };
            
            // Update UI
            if (progressBar) progressBar.style.width = '100%';
            if (progressStatus) progressStatus.textContent = `Solution found in ${solvingTime.toFixed(2)} seconds!`;
            
            // Remove from active jobs
            delete activeJobs[algorithmType];
            
            // Check if all jobs are complete
            checkAllJobsComplete();
            
        } catch (error) {
            console.error(`Polling error for ${algorithmType}:`, error);
            
            // Don't stop polling on error - just log and continue
            if (progressStatus) {
                progressStatus.textContent = `Error (will retry): ${error.message}`;
            }
        }
    }, 1000);
}

    
    // Check if all jobs are complete
    function checkAllJobsComplete() {
        if (Object.keys(activeJobs).length === 0 && Object.keys(solverResults).length > 0) {
            if (downloadSection) {
                downloadSection.style.display = 'block';
            }
            displayComparisonResults();
        }
    }
    
    // Display comparison results
    function displayComparisonResults() {
        const resultsContainer = document.getElementById('results-comparison');
        if (!resultsContainer) return;
        
        resultsContainer.innerHTML = '';
        
        // Create table
        const table = document.createElement('table');
        table.className = 'comparison-table';
        
        // Create header
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = `
            <th>Solver</th>
            <th>Time</th>
            <th>Status</th>
            <th>Action</th>
        `;
        
        table.appendChild(headerRow);
        
        // Add rows for each solver
        Object.entries(solverResults).forEach(([solver, result]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${getSolverName(solver)}</td>
                <td>${result.time.toFixed(2)}s</td>
                <td>${result.status}</td>
                <td>
                    <button class="view-button" data-solver="${solver}">View</button>
                    <button class="download-button-small" data-solver="${solver}">Download</button>
                </td>
            `;
            table.appendChild(row);
        });
        
        resultsContainer.appendChild(table);
        
        // Add event listeners to view buttons
        document.querySelectorAll('.view-button').forEach(button => {
            button.addEventListener('click', () => {
                const solver = button.dataset.solver;
                displaySolution(solverResults[solver].solvedBoard);
                displaySolutionInfo(solverResults[solver]);
            });
        });
        
        // Add event listeners to download buttons
        document.querySelectorAll('.download-button-small').forEach(button => {
            button.addEventListener('click', () => {
                const solver = button.dataset.solver;
                downloadSolution(solver);
            });
        });
        
        // Set up main download button
        const downloadAllButton = document.getElementById('download-all-button');
        if (downloadAllButton) {
            downloadAllButton.addEventListener('click', () => {
                downloadSolution();
            });
        }
        
        // Show first result by default
        const firstSolver = Object.keys(solverResults)[0];
        if (firstSolver) {
            displaySolution(solverResults[firstSolver].solvedBoard);
            displaySolutionInfo(solverResults[firstSolver]);
        }
    }
    
    // Display solution in grid
    function displaySolution(solvedBoard) {
        if (!gridVisualizer || !solvedBoard) return;
        
        gridVisualizer.innerHTML = '';
        
        // Create table for grid
        const table = document.createElement('table');
        table.className = 'grid-table';
        
        // Determine block size (for borders)
        const gridSize = solvedBoard.length;
        const blockSize = Math.sqrt(gridSize);
        
        // Create cells
        for (let i = 0; i < gridSize; i++) {
            const row = document.createElement('tr');
            
            for (let j = 0; j < gridSize; j++) {
                const cell = document.createElement('td');
                
                // Add the number
                cell.textContent = solvedBoard[i][j] || '';
                
                // Add classes for styling
                if (sudokuData && sudokuData[i][j] !== 0) {
                    cell.classList.add('original');
                } else if (solvedBoard[i][j] !== 0) {
                    cell.classList.add('solved');
                }
                
                // Add block boundary classes
                if ((j + 1) % blockSize === 0 && j < gridSize - 1) {
                    cell.classList.add('block-boundary-right');
                }
                if ((i + 1) % blockSize === 0 && i < gridSize - 1) {
                    cell.classList.add('block-boundary-bottom');
                }
                
                row.appendChild(cell);
            }
            
            table.appendChild(row);
        }
        
        gridVisualizer.appendChild(table);
    }
    
    // Display solution info
    function displaySolutionInfo(result) {
        if (currentSolverElement) {
            currentSolverElement.textContent = getSolverName(result.solver);
        }
        
        if (solvingTimeElement) {
            solvingTimeElement.textContent = `${result.time.toFixed(2)}s`;
        }
        
        if (gridSizeElement && result.solvedBoard) {
            const size = result.solvedBoard.length;
            gridSizeElement.textContent = `${size}x${size}`;
        }
        
        if (solutionStatusElement) {
            solutionStatusElement.textContent = result.status || 'Completed';
        }
    }
    
    // Download solution
    function downloadSolution(solver) {
        let solvedData;
        
        if (solver) {
            // Download specific solver result
            solvedData = solverResults[solver].solvedBoard;
        } else {
            // Download currently displayed solution (based on current solver name)
            const displayedSolver = currentSolverElement ? 
                  currentSolverElement.textContent : getSolverName(Object.keys(solverResults)[0]);
                  
            // Find solver key by displayed name
            const solverKey = Object.keys(solverResults).find(
                key => getSolverName(key) === displayedSolver
            ) || Object.keys(solverResults)[0];
            
            solvedData = solverResults[solverKey].solvedBoard;
        }
        
        if (!solvedData) return;
        
        // Create and download file
        const solverName = solver ? getSolverName(solver).toLowerCase().replace(/\s+/g, '-') : 'current';
        const blob = new Blob([JSON.stringify(solvedData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sudoku_solution_${solverName}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Initialize by updating solve button state
    updateSolveButtonState();
});