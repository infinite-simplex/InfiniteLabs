/**
 * Portfolio Website JavaScript
 * Handles loading screen, project navigation, project display, and debug functionality
 */

// =============================================================================
// PROJECT CONFIGURATION
// =============================================================================

const projectsData = {
    projects: [
        {
            segmentId: "SEGMENT 00064",
            title: "TOY EXCHANGE CORE",
            status: "NOMINAL",
            technologies: "C++20 DISRUPTOR",
            htmlFile: "ToyExchangeCore.html",
            // Optional ES module in projects/ exporting mount(root) -> unmount().
            // Scripts inside fetched HTML never run, so animated projects ship
            // their behavior as a module that the loader mounts after injecting.
            module: "ToyExchangeCore.js",
            links: {
                github: "https://github.com/infinite-simplex/ToyExchange"
            }
        },
        {
            segmentId: "SEGMENT 47740",
            title: "BATCH GPU",
            status: "NOMINAL",
            technologies: "C++20 SIMPLEX",
            htmlFile: "BatchGPU.html",
            module: "BatchGPU.js",
            links: {
                github: "https://github.com/infinite-simplex/BatchGPU"
            }
        },
        {
            segmentId: "SEGMENT 61440",
            title: "EVENT CONTRACT LOB",
            status: "NOMINAL",
            technologies: "C++20 OUCH",
            htmlFile: "EventContractLOB.html",
            module: "EventContractLOB.js",
            links: {
                github: "https://github.com/infinite-simplex/EventContractLOB"
            }
        },
        {
            type: "corrupted",
            segmentId: "SEGMENT 57005",
            title: "Communication Failure",
            htmlFile: "communication_error_project.html",
        },
        {
            segmentId: "SEGMENT 40960",
            title: "PROJECT WATTAGE",
            status: "NOMINAL",
            technologies: "PYTHON",
            htmlFile: "project_wattage.html",
            links: {
                github: "https://github.com/yourusername/project-two",
                youtube: "https://youtube.com/channel/your-channel"
            }
        },
        {
            segmentId: "SEGMENT 01984",
            title: "PROJECT TRIHARD",
            status: "NOMINAL",
            technologies: "TYPESCRIPT NEXT.JS",
            htmlFile: "project_three.html",
            links: {
                github: "https://github.com/yourusername/project-three",
                youtube: "https://youtube.com/channel/your-channel"
            }
        }
    ]
};

// =============================================================================
// PROJECT DISPLAY MODULE
// =============================================================================

const ProjectDisplay = {
    /**
     * Display project information in the project details panel
     * @param {string} htmlFile - The filename of the selected project segment
     */
    displayProject(htmlFile) {
        const projectDiv = document.getElementById('project_div');
        const displayDiv = projectDiv ? projectDiv.querySelector('#project_display') : document.getElementById('project_display');
        
        if (!displayDiv) return;
        
        // Show loading state
        displayDiv.innerHTML = `
            <p style="color: var(--NEON_GREEN);">Loading project details...</p>
        `;
        
        // Fetch and display the HTML file
        fetch(`projects/${htmlFile}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                displayDiv.innerHTML = html;
            })
            .catch(error => {
                console.error('Error loading project file:', error);
                displayDiv.innerHTML = `
                    <p style="color: red;">Error loading project details</p>
                    <p>File: ${htmlFile}</p>
                    <p>Error: ${error.message}</p>
                `;
            });
    },

    /**
     * Create a normal project segment element
     * @param {Object} project - Project data object
     * @returns {HTMLElement} - The created project segment element
     */
    createProjectSegment(project) {
        const segment = document.createElement('div');
        segment.className = 'project-segment';
        
        // Create social icons HTML
        const socialIconsHtml = project.links ? `
            <div class="social-icons">
                ${project.links.github ? `
                    <a href="${project.links.github}" target="_blank">
                        <img src="github.svg" />
                    </a>
                ` : ''}
                ${project.links.youtube ? `
                    <a href="${project.links.youtube}" target="_blank">
                        <img src="youtube.svg" />
                    </a>
                ` : ''}
            </div>
        ` : '';
        
        segment.innerHTML = `
            <span class="segment-id">${project.segmentId}</span>
            ${socialIconsHtml}
            <div class="segment-title">${project.title}</div>
            <div class="nominal">-- ${project.status} --</div>
            <div class="repair-text">${project.technologies}</div>
        `;
        
        return segment;
    },

    /**
     * Create a corrupted project segment element
     * @param {Object} project - Project data object
     * @returns {HTMLElement} - The created corrupted segment element
     */
    createCorruptedSegment(project) {
        const segment = document.createElement('div');
        segment.className = 'project-segment corrupted';
        
        segment.innerHTML = `
            <span class="segment-id">${project.segmentId}</span>
            <div class="corruption-line"></div>
            <div class="corruption-text">${project.title}</div>
            <div class="corruption-line"></div>
            <button class="debug-btn" onclick="showDebugBox()">DEBUG</button>
        `;
        
        return segment;
    },

    /**
     * Render all project segments from the configuration
     */
    renderProjects() {
        const projectsGrid = document.querySelector('.projects-grid');
        if (!projectsGrid) return;
        
        // Clear existing content
        projectsGrid.innerHTML = '';
        
        // Create and append each project segment
        projectsData.projects.forEach(project => {
            let segmentElement;
            
            if (project.type === 'corrupted') {
                segmentElement = this.createCorruptedSegment(project);
            } else {
                segmentElement = this.createProjectSegment(project);
            }

            // On click, render the project ONLY if the target isn't an anchor tag or social link
            segmentElement.addEventListener('click', (e) => {
                if (e.target.closest('a') || e.target.closest('.social-icons')) {
                    return; // Do not trigger project navigation
                }
                this.renderSpecificProject(project);
            });

            projectsGrid.appendChild(segmentElement);
        });
    },

    // Currently mounted project module's teardown, if any, plus a counter so a
    // slow fetch/import for a project the user has already left can't mount late.
    _unmount: null,
    _loadToken: 0,

    unmountCurrent() {
        this._loadToken++;
        if (this._unmount) {
            try { this._unmount(); } catch (error) { console.error('Error unmounting project:', error); }
            this._unmount = null;
        }
    },

    renderSpecificProject(project) {
        this.unmountCurrent();
        const token = this._loadToken;
        const projectDisplay = document.querySelector('#project_display');

        // The right panel scrolls on its own, so a new project would otherwise
        // open at whatever offset the previous one was left at.
        const rightPanel = document.getElementById('rightPanel');
        if (rightPanel) rightPanel.scrollTop = 0;
        
        // Disable individual panel visibility switching via Navigation
        if (Navigation.panels.projects) Navigation.panels.projects.classList.remove('active');
        if (Navigation.panels.project) Navigation.panels.project.classList.add('active');
        
        // Set the project panel's path to project title with clickable segments
        const pathElement = Navigation.panels.project.querySelector('#project_path');
        const projectPath = project.title.toLowerCase().replace(/\s+/g, '_');
        pathElement.innerHTML = `<span class="path-segment clickable" data-panel="projects">/projects</span>/<span class="path-segment">${projectPath}</span>`;
        
        // Add click event listener to the clickable path segment
        const clickableSegment = pathElement.querySelector('.path-segment.clickable');
        if (clickableSegment) {
            clickableSegment.addEventListener('click', (e) => {
                e.stopPropagation();
                Navigation.navigateToProjects();
            });
        }

        // Set the project panel's title
        Navigation.panels.project.querySelector('#project_title').textContent = project.title;
        
        // Fetch project detail content
        fetch(`projects/${project.htmlFile}`)
            .then(response => response.text())
            .then(html => {
                if (token !== this._loadToken) return; // user already moved on
                projectDisplay.innerHTML = html;

                // Animated projects: scripts in fetched HTML don't execute, so
                // import the project's module and mount it into the fresh markup.
                if (project.module) {
                    return import(`./projects/${project.module}`).then(mod => {
                        if (token !== this._loadToken) return;
                        this._unmount = mod.mount(projectDisplay);
                    });
                }
            })
            .catch(error => {
                console.error('Error loading project file:', error);
                if (token === this._loadToken) {
                    projectDisplay.innerHTML = '<p>Error loading project content.</p>';
                }
            });
    }
};

// =============================================================================
// LOADING SCREEN MODULE
// =============================================================================

const LoadingScreen = {
    targetCount: 65536,
    duration: 200, // Duration in ms for node counting animation

    /**
     * Initialize the loading screen sequence
     */
    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.startSequence();
        });
    },

    /**
     * Start the retro boot sequence
     */
    startSequence() {
        // Step 1: Backplane diagnostic
        setTimeout(() => {
            this.showBackplaneTest();
            
            // Step 2: Coordinate system nodes & memory check
            setTimeout(() => {
                this.showNodesCounter();
            }, 400);
        }, 600);
    },

    /**
     * Display backplane test success
     */
    showBackplaneTest() {
        const backplane = document.querySelector('#backplane');
        const backplaneSuccess = document.querySelector('#backplane .success');
        if (backplane) backplane.classList.remove('hidden');
        if (backplaneSuccess) backplaneSuccess.classList.remove('hidden');
    },

    /**
     * Show and animate the nodes counter
     */
    showNodesCounter() {
        const nodesElement = document.querySelector('#nodes');
        const countElement = document.querySelector('#nodeCount');
        
        if (nodesElement) nodesElement.classList.remove('hidden');
        if (countElement) this.animateCounter(countElement);
    },

    /**
     * Animate node memory/count register
     */
    animateCounter(countElement) {
        const startTime = Date.now();

        const updateCounter = () => {
            const elapsed = Date.now() - startTime;

            if (elapsed < this.duration) {
                const progress = elapsed / this.duration;
                const currentCount = Math.floor(this.targetCount * progress);
                countElement.textContent = currentCount.toLocaleString();
                requestAnimationFrame(updateCounter);
            } else {
                countElement.textContent = this.targetCount.toLocaleString();
                const nodesSuccess = document.querySelector('#nodes .success');
                if (nodesSuccess) nodesSuccess.classList.remove('hidden');
                
                // Step 3: Begin driver loading sequence
                setTimeout(() => this.loadDrivers(), 400);
            }
        };

        requestAnimationFrame(updateCounter);
    },

    /**
     * Sequence through system drivers before triggering segment corruption failure
     */
    loadDrivers() {
        const driverLog = document.querySelector('#driverLog');
        const failedDriver = document.querySelector('#failedDriver');
        
        if (driverLog) driverLog.classList.remove('hidden');

        // Trigger driver failure
        setTimeout(() => {
            if (failedDriver) failedDriver.classList.remove('hidden');
            
            // Step 4: Show debugger init error
            setTimeout(() => this.showError(), 800);
        }, 600);
    },

    /**
     * Display panic message and reveal main system interface
     */
    showError() {
        const errorElement = document.querySelector('#error');
        if (errorElement) errorElement.classList.remove('hidden');

        // Complete loading and reveal interface
        setTimeout(() => this.completeLoading(), 3500);
    },

    /**
     * Hide loading screen overlay, reveal interface, and navigate to projects
     */
    completeLoading() {
        const loadingScreen = document.querySelector('#loadingScreen');
        const mainContent = document.querySelector('#mainContent');

        if (loadingScreen) loadingScreen.classList.add('hidden');
        if (mainContent) mainContent.classList.add('visible');

        // Automatically navigate to Projects page after bootup
        Navigation.navigateToProjects();
    }
};

// =============================================================================
// NAVIGATION MODULE
// =============================================================================

const Navigation = {
    elements: {},
    panels: {},

    /**
     * Initialize the navigation system
     */
    init() {
        this.cacheElements();
        this.bindEvents();
    },

    /**
     * Cache DOM elements
     */
    cacheElements() {
        this.elements = {
            leftPanel: document.getElementById('leftPanel'),
            rightPanel: document.getElementById('rightPanel'),
            leftPanelOverlay: document.getElementById('leftPanelOverlay'),
            hamburgerBtn: document.getElementById('hamburgerBtn')
        };

        this.panels = {
            projects: document.getElementById('projectsPanel'),
            project: document.getElementById('projectPanel')
        };
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Hamburger menu events
        if (this.elements.hamburgerBtn) {
            this.elements.hamburgerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMobileMenu();
            });
        }

        if (this.elements.leftPanelOverlay) {
            this.elements.leftPanelOverlay.addEventListener('click', () => {
                this.hideMobileMenu();
            });
        }

        // Window resize event
        window.addEventListener('resize', () => {
            if (window.innerWidth > 900) {
                this.hideMobileMenu();
            }
        });
    },

    /**
     * Navigate to main projects panel
     */
    navigateToProjects() {
        // Leaving a project: stop any animations it mounted.
        ProjectDisplay.unmountCurrent();

        // Deactivate all panels
        Object.values(this.panels).forEach(panel => {
            if (panel) panel.classList.remove('active');
        });

        // Activate projects panel
        if (this.panels.projects) {
            this.panels.projects.classList.add('active');
        }

        // Hide mobile navigation panel if open
        if (window.innerWidth <= 900) {
            this.hideMobileMenu();
        }
    },

    /**
     * Toggle mobile menu visibility
     */
    toggleMobileMenu() {
        const isVisible = this.elements.leftPanel.classList.contains('mobile-visible');
        
        if (isVisible) {
            this.hideMobileMenu();
        } else {
            this.showMobileMenu();
        }
    },

    /**
     * Show mobile menu
     */
    showMobileMenu() {
        this.elements.leftPanel.classList.add('mobile-visible');
        this.elements.rightPanel.classList.add('hidden');
        if (this.elements.leftPanelOverlay) this.elements.leftPanelOverlay.style.display = 'block';
    },

    /**
     * Hide mobile menu
     */
    hideMobileMenu() {
        this.elements.leftPanel.classList.remove('mobile-visible');
        this.elements.rightPanel.classList.remove('hidden');
        if (this.elements.leftPanelOverlay) this.elements.leftPanelOverlay.style.display = 'none';
    }
};

// =============================================================================
// CLI CONSOLE MODULE
// =============================================================================

const ConsoleModule = {
  history: [],
  historyIndex: -1,

  init() {
    this.cliContainer = document.getElementById('cliInterface');
    this.outputElement = document.getElementById('cliOutput');
    this.inputElement = document.getElementById('cliInput');

    if (!this.inputElement) return;

    // Focus input when clicking anywhere inside the console box
    if (this.cliContainer) {
      this.cliContainer.addEventListener('click', () => this.inputElement.focus());
    }

    // Handle command key presses
    this.inputElement.addEventListener('keydown', (e) => this.handleKeyDown(e));
  },

  handleKeyDown(e) {
    if (e.key === 'Enter') {
      const command = this.inputElement.value.trim();
      if (command.length > 0) {
        this.printLine(`> ${command}`, 'user-cmd');
        this.history.push(command);
        this.historyIndex = this.history.length;
        this.processCommand(command);
        this.inputElement.value = '';
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.historyIndex > 0) {
        this.historyIndex--;
        this.inputElement.value = this.history[this.historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.inputElement.value = this.history[this.historyIndex];
      } else {
        this.historyIndex = this.history.length;
        this.inputElement.value = '';
      }
    }
  },

  printLine(text, className = '') {
  const line = document.createElement('div');
  line.className = `cli-line ${className}`;
  line.innerHTML = text;
  this.outputElement.appendChild(line);
  
  // Scroll the main CLI container to the bottom so the prompt stays visible
  if (this.outputElement) {
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
}
},

  processCommand(cmdInput) {
    const args = cmdInput.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    const param = args.slice(1).join(' ');

    switch (command) {
      case 'help':
        this.printLine('AVAILABLE COMMANDS:');
        this.printLine('  <span class="cmd-highlight">projects</span>      - List all projects');
        this.printLine('  <span class="cmd-highlight">open [id]</span>     - Open project (e.g. "open 1" or "open PROJECT ONE")');
        this.printLine('  <span class="cmd-highlight">about</span>         - Display developer info');
        this.printLine('  <span class="cmd-highlight">clear</span>         - Clear terminal output');
        this.printLine('  <span class="cmd-highlight">status</span>        - Display system architecture diagnostics');
        this.printLine('  <span class="cmd-highlight">ls</span>            - Display files in current working directory');
        this.printLine('  <span class="cmd-highlight">echo [text]</span>  - Echo text to terminal');
        this.printLine('  <span class="cmd-highlight">ping</span>          - Test system response');
        this.printLine('  <span class="cmd-highlight">help</span>          - Display this text again');        break;

      case 'projects':
      case 'ls':
        if (typeof projectsData !== 'undefined' && projectsData.projects) {
          this.printLine('--- REGISTERED PROJECT SEGMENTS ---');
          projectsData.projects.forEach((proj, idx) => {
            if (proj.type === 'corrupted') {
              this.printLine(`[${idx + 1}] CORRUPTED: ${proj.title} - ${proj.segmentId}`, 'error-msg');
            } else {
              this.printLine(`[${idx + 1}] ${proj.title} - ${proj.segmentId}`);
            }
          });
        } else {
          this.printLine('Error: Project metadata not found.', 'error-msg');
        }
        break;

      case 'open':
        if (!param) {
          this.printLine('Usage: open [project number or title]', 'error-msg');
          return;
        }

        const projectIndex = parseInt(param, 10) - 1;
        let targetProject = null;

        if (!isNaN(projectIndex) && projectsData.projects[projectIndex]) {
          targetProject = projectsData.projects[projectIndex];
        } else {
          targetProject = projectsData.projects.find(p => p.title.toLowerCase() === param.toLowerCase());
        }

        if (targetProject) {
          this.printLine(`Navigating to segment: ${targetProject.title}...`, 'system-msg');
          if (typeof ProjectDisplay !== 'undefined') {
            ProjectDisplay.renderSpecificProject(targetProject);
          }
        } else {
          this.printLine(`Project "${param}" not found. Type 'projects' for a list.`, 'error-msg');
        }
        break;

      case 'about':
        this.printLine('INFINITE LABS ARCHITECTURE v4.02');
        this.printLine('Role: Senior Hedging Analyst');
        this.printLine('Focus: Systems');
        break;

      case 'echo':
        if (param) {
            this.printLine(param);
        }
        break;

      case 'ping':
        this.printLine('PONG');
        break;

      case 'clear':
      case 'cls':
        this.outputElement.innerHTML = '';
        break;

      case 'status':
        this.printLine('SYSTEM STATUS: OPERATIONAL');
        this.printLine('NODES: 65,536 ONLINE');
        this.printLine('SEG_RECOVER.SYS: FAILED (Corrupted memory detected)', 'error-msg');
        break;

      default:
        this.printLine(`Command not recognized: '${command}'. Type 'help' for available commands.`, 'error-msg');
        break;
    }
  }
};

// Initialize Console when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  ConsoleModule.init();
});

// =============================================================================
// APPLICATION INITIALIZATION
// =============================================================================

// Initialize modules when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Navigation.init();
    ProjectDisplay.renderProjects();
});

// Cross-links between project pages: <a data-project="PROJECT TITLE"> opens that
// project in the panel (delegated, so it works for links inside injected pages).
document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-project]');
    if (!link) return;
    e.preventDefault();
    const project = projectsData.projects.find(p => p.title === link.dataset.project);
    if (project) ProjectDisplay.renderSpecificProject(project);
});

// Initialize loading screen sequence
LoadingScreen.init();