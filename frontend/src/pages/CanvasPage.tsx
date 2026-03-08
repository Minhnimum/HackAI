import React, { useEffect, useRef, useState } from 'react';
import { fabric } from 'fabric';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Pen, Eraser, Undo, Redo, FilePlus, Download, Upload, Mic, MessageSquare, Wand2 } from 'lucide-react';
import jsPDF from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import styles from './CanvasPage.module.css';

// Set up PDF.js worker using Vite's native URL resolution
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// Type for chat messages
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// Keep this outside the component so it persists across route changes
const globalCanvasState = {
  pages: [1] as number[],
  pageCounter: 2, // Used to generate unique page IDs
  canvasData: {} as Record<number, any>,
  chatMessages: [
    { id: '1', role: 'assistant', text: "Hi! ✨ I can see what you're working on in your canvas. Let me know if you need help understanding a concept or solving a problem!" }
  ] as ChatMessage[]
};

export default function CanvasPage() {
  const [pages, setPages] = useState<number[]>(globalCanvasState.pages);
  const [currentMode, setCurrentMode] = useState<'draw' | 'erase'>('draw');
  const [isAutoSuggestEnabled, setIsAutoSuggestEnabled] = useState(true);
  
  const [messages, setMessages] = useState<ChatMessage[]>(globalCanvasState.chatMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Refs to store Fabric canvas instances
  const fabricCanvasesRef = useRef<fabric.Canvas[]>([]);
  const activeCanvasRef = useRef<fabric.Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chatHistoryRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Refs for state persistence 
  const pagesRef = useRef(pages);
  const messagesRef = useRef(messages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Persist state when navigating away
  useEffect(() => {
    return () => {
      globalCanvasState.pages = pagesRef.current;
      globalCanvasState.chatMessages = messagesRef.current;
      pagesRef.current.forEach((pageId, index) => {
        const c = fabricCanvasesRef.current[index];
        if (c) {
          globalCanvasState.canvasData[pageId] = c.toJSON();
        }
      });
    };
  }, []);

  // Math Suggestion Refs
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSuggestionRef = useRef<fabric.Text | null>(null);
  const lastObjectBoundsRef = useRef<{left: number, top: number, right: number, bottom: number} | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev ? prev + " " + transcript : transcript);
      };
      recognition.onend = () => {
        setIsRecording(false);
      };
      recognitionRef.current = recognition;
    }
  }, []);

  // Initialize and update canvases
  useEffect(() => {
    pages.forEach((pageId, index) => {
      // Initialize if not exists
      if (!fabricCanvasesRef.current[index]) {
        const canvas = new fabric.Canvas(`canvas-${pageId}`, {
          isDrawingMode: true,
          width: 794,
          height: 1123,
          backgroundColor: '#ffffff'
        });

        canvas.freeDrawingBrush.color = '#000000';
        canvas.freeDrawingBrush.width = 3;

        // Custom undo/redo setup on object
        (canvas as any)._undoStack = [];
        (canvas as any)._redoStack = [];
        let isUndoing = false;

        const requestSuggestion = async (c: fabric.Canvas) => {
          try {
            const base64 = c.toDataURL({ format: 'jpeg', quality: 0.8 });
            const res = await fetch('/api/canvas-suggest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image_base64: base64 })
            });
            const data = await res.json();
            if (data.suggestion && lastObjectBoundsRef.current) {
              const { right, top, bottom } = lastObjectBoundsRef.current;
              
              // Calculate a proportional font size based on the drawing height
              const objHeight = bottom - top;
              const dynamicFontSize = Math.max(28, Math.min(objHeight * 0.85, 140));
              
              // Center the text vertically relative to the drawing bounds
              const textY = top + (objHeight - dynamicFontSize) / 2;
              
              const suggestionText = new fabric.Text(data.suggestion, {
                left: right + 18,
                top: textY,
                fontSize: dynamicFontSize,
                fill: '#94a3b8',
                opacity: 0.6,
                fontFamily: 'sans-serif',
                selectable: false,
                evented: false
              });
              
              c.add(suggestionText);
              activeSuggestionRef.current = suggestionText;
            }
          } catch (e) {
            console.error("Suggestion error:", e);
          }
        };

        canvas.on('object:added', function (e) {
          if (isUndoing) return;

          // Clear any active suggestion if a new object is added
          if (activeSuggestionRef.current && e.target !== activeSuggestionRef.current) {
            const sug = activeSuggestionRef.current;
            activeSuggestionRef.current = null;
            if (sug.canvas) sug.canvas.remove(sug);
          }

          // Track undo stack and trigger suggestion only for actual user drawings (paths)
          if (e.target && e.target.type !== 'text') {
            (canvas as any)._undoStack.push(e.target);
            (canvas as any)._redoStack = []; 

            const bound = e.target.getBoundingRect();
            lastObjectBoundsRef.current = {
              left: bound.left,
              top: bound.top,
              right: bound.left + bound.width,
              bottom: bound.top + bound.height
            };
            
            if (currentMode === 'draw') {
              if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
              suggestionTimerRef.current = setTimeout(() => {
                 if (isAutoSuggestEnabled) {
                    requestSuggestion(canvas);
                 }
              }, 1200);
            }
          }
        });

        canvas.on('mouse:down', function () {
          activeCanvasRef.current = canvas;
          if (activeSuggestionRef.current) {
            const sug = activeSuggestionRef.current;
            activeSuggestionRef.current = null;
            if (sug.canvas) sug.canvas.remove(sug);
          }
          if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current);
        });

        (canvas as any).undo = function () {
          const stack = (canvas as any)._undoStack;
          if (stack.length === 0) return;
          let obj = stack.pop();
          (canvas as any)._redoStack.push(obj);
          isUndoing = true;
          canvas.remove(obj);
          isUndoing = false;
        };

        (canvas as any).redo = function () {
          const stack = (canvas as any)._redoStack;
          if (stack.length === 0) return;
          let obj = stack.pop();
          (canvas as any)._undoStack.push(obj);
          isUndoing = true;
          canvas.add(obj);
          isUndoing = false;
        };

        fabricCanvasesRef.current[index] = canvas;
        
        // Restore canvas from global state if it was drawn previously
        if (globalCanvasState.canvasData[pageId]) {
          canvas.loadFromJSON(globalCanvasState.canvasData[pageId], () => {
            canvas.renderAll();
          });
        }
        
        if (!activeCanvasRef.current) {
          activeCanvasRef.current = canvas;
        }
      }
    });

    updateCanvasModes();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, isAutoSuggestEnabled]);

  const updateCanvasModes = () => {
    fabricCanvasesRef.current.forEach(canvas => {
      if (!canvas) return;
      if (currentMode === 'draw') {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.color = '#000000';
        canvas.freeDrawingBrush.width = 3;
      } else if (currentMode === 'erase') {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.color = '#ffffff'; 
        canvas.freeDrawingBrush.width = 40;
      }
    });
  };

  useEffect(() => {
    updateCanvasModes();
  }, [currentMode]);

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) { 
        e.preventDefault(); 
        handleUndo(); 
      }
      if ((e.ctrlKey && e.key.toLowerCase() === 'y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) { 
        e.preventDefault(); 
        handleRedo(); 
      }
      if (e.key === 'Tab' && activeSuggestionRef.current) {
        e.preventDefault();
        const sug = activeSuggestionRef.current;
        sug.set({
          fill: '#000000',
          opacity: 1,
          selectable: true,
          evented: true
        });
        const c = sug.canvas;
        if (c) {
          c.renderAll();
          (c as any)._undoStack.push(sug);
        }
        activeSuggestionRef.current = null;
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleUndo = () => {
    if (activeCanvasRef.current) (activeCanvasRef.current as any).undo();
  };

  const handleRedo = () => {
    if (activeCanvasRef.current) (activeCanvasRef.current as any).redo();
  };

  const addPage = () => {
    const newPageId = globalCanvasState.pageCounter++;
    setPages([...pages, newPageId]);
    setTimeout(() => {
      document.getElementById(`page-${newPageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
  };

  const removePage = (pageId: number, index: number) => {
    if (pages.length <= 1) {
      alert("You must have at least one page.");
      return;
    }

    const canvas = fabricCanvasesRef.current[index];
    if (canvas) {
      canvas.dispose();
      fabricCanvasesRef.current.splice(index, 1);
      if (activeCanvasRef.current === canvas) {
        activeCanvasRef.current = null;
      }
    }
    setPages(prev => prev.filter(p => p !== pageId));
  };

  const toggleMic = () => {
    if (!recognitionRef.current) return alert("Speech recognition not supported in this browser.");
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setIsRecording(true);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      let finalImageBase64: string | null = null;
      let hasDrawings = false;
      
      fabricCanvasesRef.current.forEach(fc => {
        if (fc && fc.getObjects && fc.getObjects().length > 0) hasDrawings = true;
      });

      if (hasDrawings) {
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = 794;
        offscreenCanvas.height = 1123 * fabricCanvasesRef.current.length;
        const ctx = offscreenCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
          
          fabricCanvasesRef.current.forEach((fc, index) => {
             if (fc) {
               const pageCanvas = fc.toCanvasElement();
               ctx.drawImage(pageCanvas, 0, index * 1123);
             }
          });
          finalImageBase64 = offscreenCanvas.toDataURL('image/jpeg', 0.8);
        }
      }

      const payload: any = { message: trimmed };
      if (finalImageBase64) {
        payload.image_base64 = finalImageBase64;
      }

      const res = await fetch('/api/canvas-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { id: Date.now().toString() + 'e', role: 'assistant', text: "Oops! Something went wrong: " + data.error }]);
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString() + 'r', role: 'assistant', text: data.response }]);
      }
    } catch(err) {
      console.error(err);
      setMessages(prev => [...prev, { id: Date.now().toString() + 'e2', role: 'assistant', text: "Error connecting to AI. Please ensure the server is running." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExport = () => {
    const pdf = new jsPDF('p', 'pt', 'a4'); // A4 size: 595.28 x 841.89 points
    fabricCanvasesRef.current.forEach((c, index) => {
        if (!c) return;
        if (index > 0) pdf.addPage();
        const dataUrl = c.toDataURL({ format: 'jpeg', quality: 0.8 });
        
        // Map 794x1123 canvas resolution into a roughly A4 pdf page size
        pdf.addImage(dataUrl, 'JPEG', 0, 0, 595.28, 841.89);
    });
    pdf.save('lecture-notes.pdf');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json, application/pdf, image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const newPages = [];
          for (let i = 1; i <= pdfDoc.numPages; i++) {
              newPages.push(i);
          }
          
          // Update the amount of pages available in React State
          setPages(newPages);
          
          // Clear current canvases gracefully without destroying their DOM presence
          fabricCanvasesRef.current.forEach(c => { 
             if (c) {
                c.clear(); 
                c.backgroundColor = '#ffffff';
                (c as any)._undoStack = [];
                (c as any)._redoStack = [];
             }
          });
          
          // Wait for DOM to catch up and React to initialize NEW Fabric canvases
          const checkReady = setInterval(async () => {
              const readyCanvases = fabricCanvasesRef.current.filter(Boolean);
              if (readyCanvases.length >= pdfDoc.numPages) {
                  clearInterval(checkReady);
                  
                  for (let i = 1; i <= pdfDoc.numPages; i++) {
                      const page = await pdfDoc.getPage(i);
                      const viewport = page.getViewport({ scale: 2.0 }); // 2x scale
                      
                      const offscreenCanvas = document.createElement('canvas');
                      const context = offscreenCanvas.getContext('2d');
                      if (!context) continue;

                      offscreenCanvas.height = viewport.height;
                      offscreenCanvas.width = viewport.width;
                      
                      await page.render({ canvasContext: context, viewport: viewport }).promise;
                      
                      const dataUrl = offscreenCanvas.toDataURL('image/jpeg', 0.9);
                      
                      const fCanvas = fabricCanvasesRef.current[i-1];
                      if (fCanvas) {
                          fabric.Image.fromURL(dataUrl, (img) => {
                              const scaleX = (fCanvas.width || 794) / (img.width || 1);
                              const scaleY = (fCanvas.height || 1123) / (img.height || 1);
                              const scale = Math.min(scaleX, scaleY);
                              
                              img.scale(scale);
                              img.set({
                                  originX: 'center',
                                  originY: 'center',
                                  left: (fCanvas.width || 794) / 2,
                                  top: (fCanvas.height || 1123) / 2,
                              });
                              
                              fCanvas.setBackgroundImage(img, fCanvas.renderAll.bind(fCanvas));
                          });
                      }
                  }
              }
          }, 100);
          
      } else if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
              const dataUrl = event.target?.result as string;
              const fCanvas = fabricCanvasesRef.current[0]; 
              if (fCanvas) {
                   fabric.Image.fromURL(dataUrl, (img) => {
                        const scaleX = (fCanvas.width || 794) / (img.width || 1);
                        const scaleY = (fCanvas.height || 1123) / (img.height || 1);
                        const scale = Math.min(scaleX, scaleY);

                        img.scale(scale);
                        img.set({
                            originX: 'center',
                            originY: 'center',
                            left: (fCanvas.width || 794) / 2,
                            top: (fCanvas.height || 1123) / 2,
                        });
                        fCanvas.setBackgroundImage(img, fCanvas.renderAll.bind(fCanvas));
                   });
              }
          };
          reader.readAsDataURL(file);
      } else if (file.name.endsWith('.json')) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const data = JSON.parse(event.target?.result as string);
              if (Array.isArray(data)) {
                const newPages = data.map((_, i) => i + 1);
                
                // Clear current canvases gracefully without destroying their DOM presence
                fabricCanvasesRef.current.forEach(c => { 
                   if (c) {
                      c.clear(); 
                      c.backgroundColor = '#ffffff';
                      (c as any)._undoStack = [];
                      (c as any)._redoStack = [];
                   }
                });
                
                setPages(newPages);
                
                const checkReady = setInterval(() => {
                  const readyCanvases = fabricCanvasesRef.current.filter(Boolean);
                  if (readyCanvases.length >= data.length) {
                    clearInterval(checkReady);
                    data.forEach((pageData, i) => {
                      if (fabricCanvasesRef.current[i] && pageData) {
                        fabricCanvasesRef.current[i].loadFromJSON(pageData, () => {
                           fabricCanvasesRef.current[i].renderAll();
                        });
                      }
                    });
                  }
                }, 100);
              }
            } catch (err) {
              alert('Failed to parse imported JSON file.');
            }
          };
          reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <div className={styles.container}>
      <div className={styles.editorContainer}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <button className={`${styles.toolBtn} ${currentMode === 'draw' ? styles.toolBtnActive : ''}`} onClick={() => setCurrentMode('draw')}>
            <Pen size={18} />
            Pen
          </button>
          <button className={`${styles.toolBtn} ${currentMode === 'erase' ? styles.toolBtnActive : ''}`} onClick={() => setCurrentMode('erase')}>
            <Eraser size={18} />
            Eraser
          </button>
          <div className={styles.toolSep}></div>
          <button className={styles.toolBtn} onClick={handleUndo}>
            <Undo size={18} />
            Undo
          </button>
          <button className={styles.toolBtn} onClick={handleRedo}>
            <Redo size={18} />
            Redo
          </button>
          <div className={styles.toolSep}></div>
          <button 
            className={`${styles.toolBtn} ${isAutoSuggestEnabled ? styles.toolBtnActive : ''}`} 
            onClick={() => setIsAutoSuggestEnabled(!isAutoSuggestEnabled)}
            style={isAutoSuggestEnabled ? {} : { color: '#a8a29e' }}
            title="Auto-Suggest Math (Draw, then wait 1s)"
          >
            <Wand2 size={18} />
            Suggest
          </button>
          <div className={styles.toolSep}></div>
          <button className={styles.toolBtn} style={{ color: '#4ade80' }} onClick={addPage}>
            <FilePlus size={18} />
            Add Page
          </button>
          <div className={styles.toolSep}></div>
          <button className={styles.toolBtn} style={{ color: '#facc15' }} onClick={handleImport}>
            <Upload size={18} />
            Import
          </button>
          <button className={styles.toolBtn} style={{ color: '#f87171' }} onClick={handleExport}>
            <Download size={18} />
            Export
          </button>
        </div>

        {/* Workspace */}
        <div className={styles.canvasWorkspace} ref={containerRef}>
          {pages.map((pageId, index) => (
            <div key={pageId} className={styles.documentPage} id={`page-${pageId}`}>
              <canvas id={`canvas-${pageId}`}></canvas>
              <button className={styles.pageDeleteBtn} onClick={() => removePage(pageId, index)} title="Delete Page">
                <Eraser size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <MessageSquare size={18} />
          AI Canvas Assistant
        </div>
        
        <div className={styles.chatHistory} ref={chatHistoryRef}>
          {messages.map(msg => (
            <div key={msg.id} className={`${styles.message} ${msg.role === 'assistant' ? styles.messageAi : styles.messageUser}`}>
              {msg.role === 'assistant' ? (
                <div className="markdown-content" style={{ color: "inherit", margin: 0 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {msg.text}
                  </ReactMarkdown>
                </div>
              ) : (
                msg.text
              )}
            </div>
          ))}
          {loading && (
            <div className={`${styles.message} ${styles.messageAi}`}>Processing your canvas...</div>
          )}
        </div>
        
        <div className={styles.chatInputArea}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
             <button 
                onClick={toggleMic} 
                className={`${styles.toolBtn} ${isRecording ? styles.micBtnActive : ''}`} 
                style={{ padding: '8px', minWidth: 'auto', margin: 0, flexShrink: 0 }}
                title="Dictate with microphone"
             >
                <Mic size={18} />
             </button>
             <textarea 
               className={styles.chatInput} 
               rows={2} 
               placeholder="Ask a question... (Enter to send)"
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={handleKeyDown}
             />
          </div>
        </div>
      </aside>
    </div>
  );
}
