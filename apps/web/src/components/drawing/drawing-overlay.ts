/**
 * Drawing Overlay System for Recording Interface
 * 
 * Provides real-time drawing and annotation capabilities during screen recording.
 * Features pen, highlighter, arrow, and text tools with undo/redo functionality.
 * 
 * Requirements: 3.5 - Drawing and annotation tools
 */

export interface DrawingPoint {
  x: number;
  y: number;
  timestamp?: number;
}

export interface DrawingPath {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  style: DrawingStyle;
  timestamp: number;
}

export interface DrawingStyle {
  color: string;
  strokeWidth: number;
  opacity: number;
  lineCap?: 'round' | 'square' | 'butt';
  lineJoin?: 'round' | 'bevel' | 'miter';
}

export type DrawingTool = 'pen' | 'highlighter' | 'arrow' | 'text' | 'none';

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  style: {
    fontSize: number;
    color: string;
    fontFamily: string;
    background?: string;
  };
  timestamp: number;
}

export interface DrawingState {
  currentTool: DrawingTool;
  currentStyle: DrawingStyle;
  paths: DrawingPath[];
  textAnnotations: TextAnnotation[];
  isDrawing: boolean;
  undoStack: Array<{ paths: DrawingPath[]; annotations: TextAnnotation[] }>;
  redoStack: Array<{ paths: DrawingPath[]; annotations: TextAnnotation[] }>;
}

export class DrawingOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private state: DrawingState;
  private currentPath: DrawingPath | null = null;
  private textInput: HTMLInputElement | null = null;
  
  // Event listeners
  private onStateChange?: (state: DrawingState) => void;
  
  // Tool configurations
  private readonly toolConfigs = {
    pen: { color: '#000000', strokeWidth: 2, opacity: 1.0 },
    highlighter: { color: '#ffff00', strokeWidth: 8, opacity: 0.3 },
    arrow: { color: '#ff0000', strokeWidth: 3, opacity: 1.0 },
    text: { fontSize: 16, color: '#000000', fontFamily: 'Arial, sans-serif' }
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = this.createCanvas();
    this.ctx = this.canvas.getContext('2d')!;
    
    this.state = {
      currentTool: 'none',
      currentStyle: this.toolConfigs.pen,
      paths: [],
      textAnnotations: [],
      isDrawing: false,
      undoStack: [],
      redoStack: []
    };

    this.setupEventListeners();
    this.setupCanvas();
  }

  private createCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'drawing-overlay absolute inset-0 pointer-events-none z-10';
    canvas.style.pointerEvents = 'none';
    this.container.appendChild(canvas);
    return canvas;
  }

  private setupCanvas(): void {
    const resizeCanvas = () => {
      const rect = this.container.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      this.redraw();
    };

    // Initial size
    resizeCanvas();

    // Resize observer for responsive updates
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(this.container);
  }

  private setupEventListeners(): void {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // Touch events for mobile support
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Prevent context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  public setTool(tool: DrawingTool): void {
    this.state.currentTool = tool;
    this.canvas.style.pointerEvents = tool === 'none' ? 'none' : 'auto';
    
    // Update cursor based on tool
    this.updateCursor();
    
    // Set default style for tool
    if (tool !== 'none' && tool !== 'text') {
      this.state.currentStyle = { ...this.toolConfigs[tool] };
    }
    
    this.notifyStateChange();
  }

  public setStyle(style: Partial<DrawingStyle>): void {
    this.state.currentStyle = { ...this.state.currentStyle, ...style };
    this.notifyStateChange();
  }

  public undo(): boolean {
    if (this.state.paths.length === 0 && this.state.textAnnotations.length === 0) {
      return false;
    }

    // Save current state to redo stack
    this.state.redoStack.push({
      paths: [...this.state.paths],
      annotations: [...this.state.textAnnotations]
    });

    // Restore previous state if available
    const previousState = this.state.undoStack.pop();
    if (previousState) {
      this.state.paths = previousState.paths;
      this.state.textAnnotations = previousState.annotations;
    } else {
      // Clear everything if no previous state
      this.state.paths = [];
      this.state.textAnnotations = [];
    }

    this.redraw();
    this.notifyStateChange();
    return true;
  }

  public redo(): boolean {
    const nextState = this.state.redoStack.pop();
    if (!nextState) {
      return false;
    }

    // Save current state to undo stack
    this.state.undoStack.push({
      paths: [...this.state.paths],
      annotations: [...this.state.textAnnotations]
    });

    // Restore next state
    this.state.paths = nextState.paths;
    this.state.textAnnotations = nextState.annotations;

    this.redraw();
    this.notifyStateChange();
    return true;
  }

  public clear(): void {
    this.saveStateForUndo();
    this.state.paths = [];
    this.state.textAnnotations = [];
    this.state.redoStack = [];
    this.redraw();
    this.notifyStateChange();
  }

  public getState(): DrawingState {
    return { ...this.state };
  }

  public loadState(state: Partial<DrawingState>): void {
    this.state = { ...this.state, ...state };
    this.redraw();
    this.notifyStateChange();
  }

  public onStateChanged(callback: (state: DrawingState) => void): void {
    this.onStateChange = callback;
  }

  private updateCursor(): void {
    const cursors = {
      pen: 'crosshair',
      highlighter: 'crosshair',
      arrow: 'crosshair',
      text: 'text',
      none: 'default'
    };
    
    this.canvas.style.cursor = cursors[this.state.currentTool];
  }

  private handleMouseDown(event: MouseEvent): void {
    if (this.state.currentTool === 'none') return;
    
    const point = this.getPointFromEvent(event);
    
    if (this.state.currentTool === 'text') {
      this.handleTextClick(point);
    } else {
      this.startDrawing(point);
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.state.isDrawing || !this.currentPath) return;
    
    const point = this.getPointFromEvent(event);
    this.addPointToCurrentPath(point);
    this.drawCurrentPath();
  }

  private handleMouseUp(event: MouseEvent): void {
    if (this.state.isDrawing) {
      this.finishDrawing();
    }
  }

  private handleTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.handleMouseDown(mouseEvent);
  }

  private handleTouchMove(event: TouchEvent): void {
    event.preventDefault();
    const touch = event.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    this.handleMouseMove(mouseEvent);
  }

  private handleTouchEnd(event: TouchEvent): void {
    event.preventDefault();
    this.handleMouseUp(new MouseEvent('mouseup'));
  }

  private getPointFromEvent(event: MouseEvent): DrawingPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      timestamp: Date.now()
    };
  }

  private startDrawing(point: DrawingPoint): void {
    this.saveStateForUndo();
    
    this.currentPath = {
      id: this.generateId(),
      tool: this.state.currentTool,
      points: [point],
      style: { ...this.state.currentStyle },
      timestamp: Date.now()
    };
    
    this.state.isDrawing = true;
    this.state.redoStack = []; // Clear redo stack on new action
  }

  private addPointToCurrentPath(point: DrawingPoint): void {
    if (this.currentPath) {
      this.currentPath.points.push(point);
    }
  }

  private finishDrawing(): void {
    if (this.currentPath) {
      this.state.paths.push(this.currentPath);
      this.currentPath = null;
    }
    
    this.state.isDrawing = false;
    this.redraw();
    this.notifyStateChange();
  }

  private handleTextClick(point: DrawingPoint): void {
    // Remove existing text input if present
    if (this.textInput) {
      this.finishTextInput();
    }

    // Create text input at click position
    this.textInput = document.createElement('input');
    this.textInput.type = 'text';
    this.textInput.className = 'absolute z-20 px-2 py-1 border border-gray-300 rounded bg-white text-sm';
    this.textInput.style.left = `${point.x}px`;
    this.textInput.style.top = `${point.y}px`;
    this.textInput.style.minWidth = '100px';
    
    // Focus and select input
    this.container.appendChild(this.textInput);
    this.textInput.focus();
    
    // Handle input events
    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.finishTextInput();
      } else if (e.key === 'Escape') {
        this.cancelTextInput();
      }
    });
    
    this.textInput.addEventListener('blur', () => {
      this.finishTextInput();
    });
  }

  private finishTextInput(): void {
    if (!this.textInput) return;
    
    const text = this.textInput.value.trim();
    if (text) {
      this.saveStateForUndo();
      
      const rect = this.textInput.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      
      const annotation: TextAnnotation = {
        id: this.generateId(),
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        text,
        style: { ...this.toolConfigs.text },
        timestamp: Date.now()
      };
      
      this.state.textAnnotations.push(annotation);
      this.state.redoStack = [];
      this.redraw();
      this.notifyStateChange();
    }
    
    this.removeTextInput();
  }

  private cancelTextInput(): void {
    this.removeTextInput();
  }

  private removeTextInput(): void {
    if (this.textInput) {
      this.textInput.remove();
      this.textInput = null;
    }
  }

  private saveStateForUndo(): void {
    this.state.undoStack.push({
      paths: [...this.state.paths],
      annotations: [...this.state.textAnnotations]
    });
    
    // Limit undo stack size
    if (this.state.undoStack.length > 50) {
      this.state.undoStack.shift();
    }
  }

  private redraw(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw all paths
    for (const path of this.state.paths) {
      this.drawPath(path);
    }
    
    // Draw text annotations
    for (const annotation of this.state.textAnnotations) {
      this.drawTextAnnotation(annotation);
    }
  }

  private drawCurrentPath(): void {
    if (this.currentPath) {
      this.redraw();
      this.drawPath(this.currentPath);
    }
  }

  private drawPath(path: DrawingPath): void {
    if (path.points.length === 0) return;
    
    this.ctx.save();
    this.ctx.strokeStyle = path.style.color;
    this.ctx.lineWidth = path.style.strokeWidth;
    this.ctx.globalAlpha = path.style.opacity;
    this.ctx.lineCap = path.style.lineCap || 'round';
    this.ctx.lineJoin = path.style.lineJoin || 'round';
    
    if (path.tool === 'arrow' && path.points.length >= 2) {
      this.drawArrow(path.points[0], path.points[path.points.length - 1]);
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(path.points[0].x, path.points[0].y);
      
      for (let i = 1; i < path.points.length; i++) {
        this.ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }

  private drawArrow(start: DrawingPoint, end: DrawingPoint): void {
    const headLength = 15;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    
    // Draw line
    this.ctx.beginPath();
    this.ctx.moveTo(start.x, start.y);
    this.ctx.lineTo(end.x, end.y);
    this.ctx.stroke();
    
    // Draw arrowhead
    this.ctx.beginPath();
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(
      end.x - headLength * Math.cos(angle - Math.PI / 6),
      end.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.moveTo(end.x, end.y);
    this.ctx.lineTo(
      end.x - headLength * Math.cos(angle + Math.PI / 6),
      end.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.stroke();
  }

  private drawTextAnnotation(annotation: TextAnnotation): void {
    this.ctx.save();
    this.ctx.font = `${annotation.style.fontSize}px ${annotation.style.fontFamily}`;
    this.ctx.fillStyle = annotation.style.color;
    
    // Draw background if specified
    if (annotation.style.background) {
      const metrics = this.ctx.measureText(annotation.text);
      this.ctx.fillStyle = annotation.style.background;
      this.ctx.fillRect(
        annotation.x - 2,
        annotation.y - annotation.style.fontSize - 2,
        metrics.width + 4,
        annotation.style.fontSize + 4
      );
      this.ctx.fillStyle = annotation.style.color;
    }
    
    this.ctx.fillText(annotation.text, annotation.x, annotation.y);
    this.ctx.restore();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  public destroy(): void {
    this.removeTextInput();
    this.canvas.remove();
  }
}