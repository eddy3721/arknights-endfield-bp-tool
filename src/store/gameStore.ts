import { create } from 'zustand';
import { GameMode } from '../types';
import type { Connection, PlacedMachine, Point, Direction } from '../types';
import { MACHINES } from '../config/machines';
import { checkCollision, findPath } from '../utils/gridUtils';
import { getRotatedDimensions, getRotatedPorts } from '../utils/machineUtils';

interface HistorySnapshot {
    machines: PlacedMachine[];
    connections: Connection[];
    gridWidth: number;
    gridHeight: number;
}

interface GameState {
    machines: PlacedMachine[];
    connections: Connection[];
    mode: GameMode;
    selectedMachineId: string | null; // ID of machine to place from palette
    previewRotation: Direction;

    // Wiring State
    isWiring: boolean;
    isWiringValid: boolean;
    wiringSource: { machineId: string; portIndex: number; absolutePos: Point } | null;
    wiringFixedPath: Point[]; // Anchored segments
    wiringPreviewPath: Point[]; // Fixed + Current Preview

    // View State
    zoom: number;
    pan: Point;
    didPan: boolean; // 本次滑鼠手勢是否為拖動畫布（用於抑制手勢結束時的 click/contextmenu 誤觸）

    // Grid State
    gridWidth: number;
    gridHeight: number;

    movingMachineBackup: PlacedMachine | null; // Stores machine while moving

    // Box Selection & Batch Move
    selectionStart: Point | null;
    selectionEnd: Point | null;
    selectedMachineIds: string[];
    selectedConnectionIds: string[];

    moveAnchor: Point | null;
    movingMachinesSnapshot: PlacedMachine[];
    movingConnectionsSnapshot: Connection[];
    isCopying: boolean; // Distinguish between Move (restore on cancel) and Copy (discard on cancel)

    // UI State
    uiView: 'list' | 'editor' | 'about' | 'settings';
    blueprintListMode: 'manage' | 'insert';
    materialSelectorMachineId: string | null;

    // History
    history: {
        past: HistorySnapshot[];
        future: HistorySnapshot[];
    };
    undo: () => void;
    redo: () => void;
    takeSnapshot: () => void;


    // Actions
    setMode: (mode: GameMode) => void;
    selectMachine: (machineId: string | null) => void;
    rotatePreview: () => void;
    addMachine: (machineId: string, x: number, y: number, rotation: Direction) => void;
    removeMachine: (instanceId: string) => void;
    pickupMachine: (instanceId: string) => void;
    cancelOperation: () => void; // Cancels wiring or placement/move
    setGridSize: (width: number, height: number) => void;

    // Box Selection Actions
    setBoxSelection: (start: Point | null, end: Point | null) => void;
    commitBoxSelection: (isToggle?: boolean) => void;
    clearSelection: () => void;
    deleteSelected: () => void;

    // Batch Move Actions
    startBatchMove: (anchor: Point) => void;
    startCopySelection: (anchor: Point) => void;
    commitBatchMove: (targetPos: Point) => void;

    // UI Actions
    setUiView: (view: 'list' | 'editor' | 'about' | 'settings') => void;
    setBlueprintListMode: (mode: 'manage' | 'insert') => void;
    startInsertBlueprint: (blueprint: { data: { machines: any[], connections: any[] } }) => void;

    // Material Selection Actions
    openMaterialSelector: (machineInstanceId: string) => void;
    closeMaterialSelector: () => void;
    setMachineMaterial: (instanceId: string, materialId: string) => void;

    // Blueprint Actions
    currentBlueprintId: string | null;
    currentBlueprintName: string | null;
    loadGame: (machines: PlacedMachine[], connections: Connection[], gridWidth: number, gridHeight: number, blueprintId: string | null, blueprintName: string) => void;
    setCurrentBlueprint: (id: string, name: string) => void;
    resetGame: () => void;

    startWiring: (machineInstanceId: string, portIndex: number, absolutePos: Point) => void;
    updateWiringPreview: (mouseGridPos: Point) => void;
    addWiringAnchor: (pos: Point) => void;
    commitWiring: () => void;
    cancelWiring: () => void;

    setZoom: (zoom: number) => void;
    setPan: (pan: Point) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
    machines: [],
    connections: [],
    mode: GameMode.BUILD,
    selectedMachineId: null,
    previewRotation: 0,
    movingMachineBackup: null,

    selectionStart: null,
    selectionEnd: null,
    selectedMachineIds: [],
    selectedConnectionIds: [],

    moveAnchor: null,
    movingMachinesSnapshot: [],
    movingConnectionsSnapshot: [],
    isCopying: false,

    uiView: 'editor',
    blueprintListMode: 'manage',
    materialSelectorMachineId: null,

    history: {
        past: [],
        future: []
    },

    isWiring: false,
    isWiringValid: true,
    wiringSource: null,
    wiringFixedPath: [],
    wiringPreviewPath: [],

    zoom: 1,
    pan: { x: 0, y: 0 },
    didPan: false,
    gridWidth: 24,
    gridHeight: 24,

    currentBlueprintId: null,
    currentBlueprintName: null,

    setMode: (mode) => set({ mode }),
    selectMachine: (machineId) => {
        // If we were moving a machine and select something else, typically we might want to restore or delete.
        // For now, let's assume selecting a new machine cancels the move (restores it) to be safe.
        const { movingMachineBackup } = get();
        if (movingMachineBackup) {
            set(state => ({
                machines: [...state.machines, movingMachineBackup],
                movingMachineBackup: null
            }));
        }
        set({ selectedMachineId: machineId, mode: GameMode.BUILD, previewRotation: 0 });
    },
    rotatePreview: () => set(state => ({ previewRotation: (state.previewRotation + 1) % 4 as Direction })),
    setZoom: (zoom) => set({ zoom }),
    setPan: (pan) => set({ pan }),

    setGridSize: (width, height) => {
        get().takeSnapshot();
        set({ gridWidth: width, gridHeight: height });
    },

    takeSnapshot: () => {
        const { machines, connections, gridWidth, gridHeight, history } = get();
        const snapshot: HistorySnapshot = {
            machines,
            connections,
            gridWidth,
            gridHeight
        };

        set({
            history: {
                past: [...history.past, snapshot],
                future: [] // New action clears future (redo stack)
            }
        });
    },

    undo: () => {
        const { history, cancelOperation } = get();
        if (history.past.length === 0) return;

        // Cancel any active operation first to ensure clean state
        cancelOperation();

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        const currentSnapshot: HistorySnapshot = {
            machines: get().machines,
            connections: get().connections,
            gridWidth: get().gridWidth,
            gridHeight: get().gridHeight
        };

        set({
            machines: previous.machines,
            connections: previous.connections,
            gridWidth: previous.gridWidth,
            gridHeight: previous.gridHeight,
            history: {
                past: newPast,
                future: [currentSnapshot, ...history.future]
            }
        });
    },

    redo: () => {
        const { history, cancelOperation } = get();
        if (history.future.length === 0) return;

        cancelOperation();

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        const currentSnapshot: HistorySnapshot = {
            machines: get().machines,
            connections: get().connections,
            gridWidth: get().gridWidth,
            gridHeight: get().gridHeight
        };

        set({
            machines: next.machines,
            connections: next.connections,
            gridWidth: next.gridWidth,
            gridHeight: next.gridHeight,
            history: {
                past: [...history.past, currentSnapshot],
                future: newFuture
            }
        });
    },

    addMachine: (machineId, x, y, rotation) => {
        const config = MACHINES.find(m => m.id === machineId);
        if (!config) return;

        // Collision Check
        const { width, height } = getRotatedDimensions(config.width, config.height, rotation);
        const candidateRect = {
            x,
            y,
            width,
            height
        };

        const currentMachines = get().machines;

        // Boundary Check
        if (candidateRect.x < 0 || candidateRect.y < 0 ||
            candidateRect.x + candidateRect.width > get().gridWidth ||
            candidateRect.y + candidateRect.height > get().gridHeight) {
            return;
        }

        if (checkCollision(candidateRect, currentMachines)) {
            // Collision detected, do not place
            return;
        }

        const { movingMachineBackup } = get();
        let finalId: any = crypto.randomUUID();
        let shouldClearConnections = false;

        if (movingMachineBackup) {
            finalId = movingMachineBackup.id; // Preserve ID
            // Check if position changed
            if (movingMachineBackup.x !== x || movingMachineBackup.y !== y) {
                shouldClearConnections = true;
            }
        }

        const newMachine: PlacedMachine = {
            id: finalId,
            machineId,
            x,
            y,
            rotation,
        };

        let oldInputLocations = new Set<string>();
        if (shouldClearConnections && movingMachineBackup) {
            const config = MACHINES.find(m => m.id === movingMachineBackup.machineId);
            if (config) {
                const inputs = getRotatedPorts(config.inputs, config.width, config.height, movingMachineBackup.rotation);
                inputs.forEach(p => {
                    oldInputLocations.add(`${movingMachineBackup.x + p.x},${movingMachineBackup.y + p.y}`);
                });
            }
        }

        get().takeSnapshot();

        set(state => ({
            machines: [...state.machines, newMachine],
            connections: shouldClearConnections
                ? state.connections.filter(c => {
                    // Remove if starting from this machine
                    if (c.fromOriginal.machineId === finalId) return false;
                    // Remove if ending at this machine (by ID)
                    if (c.toOriginal?.machineId === finalId) return false;

                    // Remove if ending at this machine (by Geometry - for old connections or if toOriginal is missing)
                    const endPoint = c.path[c.path.length - 1];
                    if (endPoint && oldInputLocations.has(`${endPoint.x},${endPoint.y}`)) {
                        return false;
                    }

                    return true;
                })
                : state.connections,
            movingMachineBackup: null // Clear backup on successful placement (move completed)
        }));
    },

    removeMachine: (instanceId) => {
        get().takeSnapshot();
        set(state => ({
            machines: state.machines.filter(m => m.id !== instanceId),
            connections: state.connections.filter(c => c.fromOriginal.machineId !== instanceId && c.toOriginal?.machineId !== instanceId)
        }));
    },

    pickupMachine: (instanceId) => {
        get().takeSnapshot();
        const { machines } = get();
        const machine = machines.find(m => m.id === instanceId);
        if (!machine) return;

        set(() => ({
            movingMachineBackup: machine,
            selectedMachineId: machine.machineId,
            previewRotation: machine.rotation,
            mode: GameMode.BUILD,
            machines: machines.filter(m => m.id !== instanceId),
            // Do NOT clear connections here. We wait until placement to decide.
        }));
    },

    cancelOperation: () => {
        const { isWiring, movingMachineBackup } = get();
        if (isWiring) {
            get().cancelWiring();
        } else if (movingMachineBackup) {
            // Restore moved machine
            set(state => ({
                machines: [...state.machines, movingMachineBackup],
                movingMachineBackup: null,
                selectedMachineId: null,
                mode: GameMode.BUILD
            }));
        } else {
            // Normal deselect
            set({ selectedMachineId: null });
        }

        // Handle Box Select / Batch Move Cancel
        const { mode, movingMachinesSnapshot, movingConnectionsSnapshot } = get();
        if (mode === GameMode.BOX_SELECT) {
            set({ selectionStart: null, selectionEnd: null, selectedMachineIds: [], selectedConnectionIds: [], mode: GameMode.BUILD });
        }
        if (mode === GameMode.MOVE_SELECTION) {
            const { isCopying: wasCopying } = get();
            if (wasCopying) {
                // Copying: discard clones (snapshot)
                set({
                    movingMachinesSnapshot: [],
                    movingConnectionsSnapshot: [],
                    moveAnchor: null,
                    mode: GameMode.BOX_SELECT,
                    isCopying: false
                });
            } else {
                // Moving: restore items
                set(state => ({
                    machines: [...state.machines, ...movingMachinesSnapshot],
                    connections: [...state.connections, ...movingConnectionsSnapshot],
                    movingMachinesSnapshot: [],
                    movingConnectionsSnapshot: [],
                    moveAnchor: null,
                    mode: GameMode.BOX_SELECT
                }));
            }
        }
    },

    startWiring: (machineInstanceId, portIndex, absolutePos) => {
        set({
            isWiring: true,
            isWiringValid: true,
            wiringSource: { machineId: machineInstanceId, portIndex, absolutePos },
            wiringFixedPath: [absolutePos],
            wiringPreviewPath: [absolutePos] // Start point
        });
    },

    updateWiringPreview: (mouseGridPos) => {
        const { wiringSource, machines, wiringFixedPath } = get();
        if (!wiringSource || wiringFixedPath.length === 0) return;

        const start = wiringFixedPath[wiringFixedPath.length - 1]; // Start from last anchor
        const end = mouseGridPos;

        // Determine Start Side (only matters if we are at the very beginning of the whole path)
        let startSide: 'top' | 'right' | 'bottom' | 'left' | undefined;
        if (wiringFixedPath.length === 1) { // Only first point
            const sourceMachine = machines.find(m => m.id === wiringSource.machineId);
            if (sourceMachine) {
                const config = MACHINES.find(m => m.id === sourceMachine.machineId);
                if (config) {
                    const outputs = getRotatedPorts(config.outputs, config.width, config.height, sourceMachine.rotation);
                    if (outputs[wiringSource.portIndex]) {
                        startSide = outputs[wiringSource.portIndex].side;
                    }
                }
            }
        }

        // Determine End Side if hovering a valid input port
        let endSide: 'top' | 'right' | 'bottom' | 'left' | undefined;
        // Naive check: is mouse on any machine's input port?
        for (const m of machines) {
            const config = MACHINES.find(mc => mc.id === m.machineId);
            if (!config) continue;

            const inputs = getRotatedPorts(config.inputs, config.width, config.height, m.rotation);
            inputs.forEach((p) => {
                const absX = m.x + p.x;
                const absY = m.y + p.y;
                if (absX === end.x && absY === end.y) {
                    endSide = p.side;
                }
            });
        }

        const segmentPath = findPath(start, end, machines, startSide, endSide);

        if (segmentPath) {
            const cleanSegment = segmentPath.length > 0 ? segmentPath.slice(1) : [];
            set({
                wiringPreviewPath: [...wiringFixedPath, ...cleanSegment],
                isWiringValid: true
            });
        } else {
            // Invalid path - Show straight line but flag as invalid
            // We want to show a straight line to indicating intent, but red?
            set({
                wiringPreviewPath: [...wiringFixedPath, end],
                isWiringValid: false
            });
        }
    },

    addWiringAnchor: (pos) => {
        const { wiringSource, machines, wiringFixedPath } = get();
        if (!wiringSource || wiringFixedPath.length === 0) return;

        const start = wiringFixedPath[wiringFixedPath.length - 1];
        const end = pos;

        // Check validity before adding anchor
        let startSide: 'top' | 'right' | 'bottom' | 'left' | undefined;
        if (wiringFixedPath.length === 1) {
            const sourceMachine = machines.find(m => m.id === wiringSource.machineId);
            if (sourceMachine) {
                const config = MACHINES.find(m => m.id === sourceMachine.machineId);
                if (config) {
                    const outputs = getRotatedPorts(config.outputs, config.width, config.height, sourceMachine.rotation);
                    if (outputs[wiringSource.portIndex]) {
                        startSide = outputs[wiringSource.portIndex].side;
                    }
                }
            }
        }

        const segmentPath = findPath(start, end, machines, startSide, undefined);

        if (segmentPath) {
            const cleanSegment = segmentPath.length > 0 ? segmentPath.slice(1) : [];
            set({ wiringFixedPath: [...wiringFixedPath, ...cleanSegment] });
        } else {
            // Do nothing if invalid? Or feedback?
        }
    },

    commitWiring: () => {
        const { wiringSource, wiringPreviewPath, isWiringValid, machines, connections } = get();
        if (!wiringSource || wiringPreviewPath.length < 2 || !isWiringValid) {
            get().cancelWiring();
            return;
        }

        get().takeSnapshot();

        const end = wiringPreviewPath[wiringPreviewPath.length - 1];
        let toOriginal: { machineId: string; portIndex: number } | null = null;

        // Find target machine/port
        for (const m of machines) {
            const config = MACHINES.find(mc => mc.id === m.machineId);
            if (!config) continue;

            const inputs = getRotatedPorts(config.inputs, config.width, config.height, m.rotation);
            // Check if end matches any input
            const portIndex = inputs.findIndex(p => {
                const absX = m.x + p.x;
                const absY = m.y + p.y;
                return absX === end.x && absY === end.y;
            });

            if (portIndex !== -1) {
                toOriginal = { machineId: m.id, portIndex };
                break;
            }
        }

        // --- Logistics Bridge Generation Logic ---
        const intersections = new Set<string>();
        const existingPoints = new Set<string>();

        // 1. Index all existing connection points
        for (const conn of connections) {
            for (const p of conn.path) {
                existingPoints.add(`${p.x},${p.y}`);
            }
        }

        // 2. Identify intersections (including self-intersections in the new path)
        const currentPathSet = new Set<string>();
        for (const p of wiringPreviewPath) {
            const key = `${p.x},${p.y}`;
            if (existingPoints.has(key) || currentPathSet.has(key)) {
                intersections.add(key);
            }
            currentPathSet.add(key);
        }

        // 3. Filter out locations occupied by machines and create bridges
        const bridgesToCreate: PlacedMachine[] = [];
        for (const key of intersections) {
            const [sx, sy] = key.split(',');
            const x = parseInt(sx);
            const y = parseInt(sy);

            // Check if occupied by any machine
            const isOccupied = machines.some(m => {
                const config = MACHINES.find(c => c.id === m.machineId);
                if (!config) return false;
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                return x >= m.x && x < m.x + width && y >= m.y && y < m.y + height;
            });

            if (!isOccupied) {
                bridgesToCreate.push({
                    id: crypto.randomUUID(),
                    machineId: 'logistics-bridge',
                    x,
                    y,
                    rotation: 0
                });
            }
        }

        const newConnection: Connection = {
            id: crypto.randomUUID(),
            fromOriginal: { machineId: wiringSource.machineId, portIndex: wiringSource.portIndex },
            toOriginal,
            path: [...wiringPreviewPath]
        };

        set(state => ({
            machines: [...state.machines, ...bridgesToCreate],
            connections: [...state.connections, newConnection],
            isWiring: false,
            isWiringValid: true,
            wiringSource: null,
            wiringFixedPath: [],
            wiringPreviewPath: []
        }));
    },

    cancelWiring: () => {
        set({ isWiring: false, isWiringValid: true, wiringSource: null, wiringFixedPath: [], wiringPreviewPath: [] });
    },

    // Box Selection Implementation
    setBoxSelection: (start, end) => set({ selectionStart: start, selectionEnd: end }),

    commitBoxSelection: (isToggle: boolean = false) => {
        const { selectionStart, selectionEnd, machines, connections, selectedMachineIds: prevMachineIds, selectedConnectionIds: prevConnectionIds } = get();
        if (!selectionStart || !selectionEnd) return;

        // Normalize Selection Rect
        const x1 = Math.min(selectionStart.x, selectionEnd.x);
        const y1 = Math.min(selectionStart.y, selectionEnd.y);
        const x2 = Math.max(selectionStart.x, selectionEnd.x);
        const y2 = Math.max(selectionStart.y, selectionEnd.y);

        // Filter Machines in Box
        const machineIdsInBox = machines.filter(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (!config) return false;
            const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
            // Machine Rect
            const mx1 = m.x;
            const my1 = m.y;
            const mx2 = m.x + width;
            const my2 = m.y + height;

            // Check Intersection
            // mx2 and my2 are exclusive bounds (starting point + size)
            // So if selection start (x1) equals mx2, they do NOT touch.
            return !(x2 < mx1 || x1 >= mx2 || y2 < my1 || y1 >= my2);
        }).map(m => m.id);

        // Filter Connections in Box
        let connectionIdsInBox = connections.filter(c => {
            // Precise check: Is any point of the path inside the selection box?
            return c.path.some(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
        }).map(c => c.id);

        const isSingleCell = (x1 === x2) && (y1 === y2);

        // Priority Rule: If selecting a single cell and we found a machine, ignore connections at that spot.
        // This prevents accidental selection of the connected wire when clicking a machine.
        // User request: "Unless I box-select ... don't select it" implies clicking machine shouldn't select wire.
        if (isSingleCell && machineIdsInBox.length > 0) {
            connectionIdsInBox = [];
        }

        let finalMachineIds = machineIdsInBox;
        let finalConnectionIds = connectionIdsInBox;

        if (isToggle) {
            // Symmetric Difference (XOR)
            // If already selected AND in box -> remove (toggle off)
            // If not selected AND in box -> add (toggle on)
            // If not in box -> keep status (keep selected if selected, keep unselected if unselected)

            // Machines
            const boxSet = new Set(machineIdsInBox);
            const prevSet = new Set(prevMachineIds);

            // Items in box that are NOT in prev -> ADD
            const toAdd = machineIdsInBox.filter(id => !prevSet.has(id));
            // Items in box that ARE in prev -> REMOVE (Toggle off)
            // const toRemove = machineIdsInBox.filter(id => prevSet.has(id));

            // Result = (Prev - toRemove) + toAdd
            const kept = prevMachineIds.filter(id => !boxSet.has(id)); // Keep those NOT in box
            finalMachineIds = [...kept, ...toAdd];

            // Connections
            const boxConnSet = new Set(connectionIdsInBox);
            const prevConnSet = new Set(prevConnectionIds);

            const connToAdd = connectionIdsInBox.filter(id => !prevConnSet.has(id));
            const connToKeep = prevConnectionIds.filter(id => !boxConnSet.has(id));
            finalConnectionIds = [...connToKeep, ...connToAdd];
        }

        set({
            selectedMachineIds: finalMachineIds,
            selectedConnectionIds: finalConnectionIds,
            selectionStart: null,
            selectionEnd: null
        });
    },

    clearSelection: () => set({ selectedMachineIds: [], selectedConnectionIds: [] }),

    deleteSelected: () => {
        // Reuse remove logic? 
        // We need to cascade delete connections attached to deleted machines.
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        get().takeSnapshot();

        // 1. Determine all machines to remove
        const machinesToRemove = new Set(selectedMachineIds);

        // 2. Determine all connections to remove (explicitly selected OR attached to removed machines)
        const connectionsToRemove = new Set(selectedConnectionIds);

        connections.forEach(c => {
            if (machinesToRemove.has(c.fromOriginal.machineId) || (c.toOriginal && machinesToRemove.has(c.toOriginal.machineId))) {
                connectionsToRemove.add(c.id);
            }
        });

        const newMachines = machines.filter(m => !machinesToRemove.has(m.id));
        const newConnections = connections.filter(c => !connectionsToRemove.has(c.id));

        set({
            machines: newMachines,
            connections: newConnections,
            selectedMachineIds: [],
            selectedConnectionIds: []
        });
    },

    setUiView: (view) => set({ uiView: view }),
    setBlueprintListMode: (mode) => set({ blueprintListMode: mode }),

    openMaterialSelector: (machineInstanceId) => set({ materialSelectorMachineId: machineInstanceId }),
    closeMaterialSelector: () => set({ materialSelectorMachineId: null }),
    setMachineMaterial: (instanceId, materialId) => {
        get().takeSnapshot();
        set(state => ({
            machines: state.machines.map(m => m.id === instanceId ? { ...m, selectedMaterialId: materialId } : m),
            materialSelectorMachineId: null
        }));
    },

    startInsertBlueprint: (blueprint) => {
        const { machines, connections } = blueprint.data;
        if (machines.length === 0 && connections.length === 0) return;

        // Calculate Center
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        machines.forEach((m: any) => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (config) {
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + width);
                maxY = Math.max(maxY, m.y + height);
            }
        });

        connections.forEach((c: any) => {
            c.path.forEach((p: any) => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + 1);
                maxY = Math.max(maxY, p.y + 1);
            });
        });

        const centerX = Math.floor((minX + maxX) / 2);
        const centerY = Math.floor((minY + maxY) / 2);
        const selectionCenter = { x: centerX, y: centerY };

        // Normalize Data (Clone with new IDs)
        // Similar to copy logic
        const idMap: Record<string, string> = {};

        const newMachines = machines.map((m: any) => {
            const newId = crypto.randomUUID();
            idMap[m.id] = newId;
            return { ...m, id: newId };
        });

        const newConnections = connections.map((c: any) => {
            // Remap IDs
            const fromId = idMap[c.fromOriginal.machineId];
            if (!fromId) return null; // Should not happen in valid blueprint

            let toOriginal = null;
            if (c.toOriginal) {
                const toId = idMap[c.toOriginal.machineId];
                if (toId) {
                    toOriginal = { ...c.toOriginal, machineId: toId };
                }
            }

            return {
                ...c,
                id: crypto.randomUUID(),
                fromOriginal: { ...c.fromOriginal, machineId: fromId },
                toOriginal,
                // Force path copy
                path: c.path.map((p: any) => ({ ...p }))
            };
        }).filter((c: any) => c !== null);

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: selectionCenter,
            movingMachinesSnapshot: newMachines,
            movingConnectionsSnapshot: newConnections,
            isCopying: true, // Treat as copy so cancel discards them
            uiView: 'editor' // Switch back to editor
        });
    },

    startBatchMove: (_anchor: Point) => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        // Extract items
        const movingMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const movingConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        // Calculate Selection Center for Snap Behavior
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        if (movingMachines.length === 0 && movingConnections.length === 0) {
            // Should not happen due to check above
            return;
        }

        // 1. Machines Bounds
        movingMachines.forEach(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (config) {
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + width);
                maxY = Math.max(maxY, m.y + height);
            }
        });

        // 2. Connections Bounds
        movingConnections.forEach(c => {
            c.path.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + 1); // +1 assuming cell size
                maxY = Math.max(maxY, p.y + 1);
            });
        });

        const centerX = Math.floor((minX + maxX) / 2);
        const centerY = Math.floor((minY + maxY) / 2);
        const selectionCenter = { x: centerX, y: centerY };

        // Remove from world (temporary)
        const remainingMachines = machines.filter(m => !selectedMachineIds.includes(m.id));
        const remainingConnections = connections.filter(c => !selectedConnectionIds.includes(c.id));

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: selectionCenter, // Use Center as Anchor to snap selection to mouse
            movingMachinesSnapshot: movingMachines,
            movingConnectionsSnapshot: movingConnections,
            machines: remainingMachines,
            connections: remainingConnections,
            // Keep selection IDs so we know what we are moving? Or clear them?
            // Usually we clear selection while moving, then re-select on place.
            selectedMachineIds: [],
            selectedConnectionIds: [],
            isCopying: false
        });
    },

    startCopySelection: (_anchor: Point) => {
        const { machines, connections, selectedMachineIds, selectedConnectionIds } = get();
        if (selectedMachineIds.length === 0 && selectedConnectionIds.length === 0) return;

        // Filter items to copy
        const sourceMachines = machines.filter(m => selectedMachineIds.includes(m.id));
        const sourceConnections = connections.filter(c => selectedConnectionIds.includes(c.id));

        if (sourceMachines.length === 0 && sourceConnections.length === 0) return;

        // Calculate Selection Center
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        sourceMachines.forEach(m => {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (config) {
                const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
                minX = Math.min(minX, m.x);
                minY = Math.min(minY, m.y);
                maxX = Math.max(maxX, m.x + width);
                maxY = Math.max(maxY, m.y + height);
            }
        });

        sourceConnections.forEach(c => {
            c.path.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x + 1);
                maxY = Math.max(maxY, p.y + 1);
            });
        });

        const centerX = Math.floor((minX + maxX) / 2);
        const centerY = Math.floor((minY + maxY) / 2);
        const selectionCenter = { x: centerX, y: centerY };

        // ID Mapping: OldID -> NewID
        const idMap: Record<string, string> = {};

        // Clone Machines
        const newMachines: PlacedMachine[] = sourceMachines.map(m => {
            const newId = crypto.randomUUID();
            idMap[m.id] = newId;
            return {
                ...m,
                id: newId
            };
        });

        // Clone Connections
        const newConnections: Connection[] = [];
        sourceConnections.forEach(c => {
            // Remap IDs
            const fromId = idMap[c.fromOriginal.machineId];

            // For toOriginal, it might be null/undefined OR it might point to a machine outside selection.
            // If outside selection, we detach it (because physical copy doesn't drag the wire across the map).
            // Actually, if we copy a wire, and one end is NOT in the selection, it becomes a dangling wire?
            // In Factorio/Shapez, if you copy a belt without the machine, it's just a belt.
            // But here connections are logical links.
            // A logical link requires both endpoints usually, or at least a valid 'from'.
            // If 'from' machine was not copied, we can't create this connection unless we make it 'from' the original machine?
            // No, that would duplicate the wire from the original machine.
            // Rule: Only copy connection if 'from' machine is also copied.

            if (!fromId) {
                // The source of this connection was NOT selected. 
                // We do not copy this connection.
                return;
            }

            let toOriginal: { machineId: string; portIndex: number } | null = null;
            if (c.toOriginal) {
                const toId = idMap[c.toOriginal.machineId];
                if (toId) {
                    toOriginal = { ...c.toOriginal, machineId: toId };
                } else {
                    // Target not in selection. Detach?
                    // leave null.
                }
            }

            newConnections.push({
                ...c,
                id: crypto.randomUUID(),
                fromOriginal: { ...c.fromOriginal, machineId: fromId },
                toOriginal,
                path: [...c.path] // Deep copy path
            });
        });

        set({
            mode: GameMode.MOVE_SELECTION,
            moveAnchor: selectionCenter,
            movingMachinesSnapshot: newMachines,
            movingConnectionsSnapshot: newConnections,
            // DO NOT Remove from machines/connections (Copy mode)
            // But we Deselect originals so we can focus on placing the ghost
            selectedMachineIds: [],
            selectedConnectionIds: [],
            isCopying: true
        });
    },

    commitBatchMove: (targetPos) => {
        const { moveAnchor, movingMachinesSnapshot, movingConnectionsSnapshot, machines, gridWidth, gridHeight, connections } = get();
        if (!moveAnchor) return;

        // We check collision first. If valid, we snapshot BEFORE applying changes.
        // Wait, collisions are checked below. We should only snapshot if we proceed.

        const offsetX = targetPos.x - moveAnchor.x;
        const offsetY = targetPos.y - moveAnchor.y;

        // Collision Check for Machines
        let collision = false;

        // Tentative new positions
        const placedMachines = movingMachinesSnapshot.map(m => ({
            ...m,
            x: m.x + offsetX,
            y: m.y + offsetY
        }));

        for (const m of placedMachines) {
            const config = MACHINES.find(c => c.id === m.machineId);
            if (!config) continue;
            const { width, height } = getRotatedDimensions(config.width, config.height, m.rotation);
            const rect = { x: m.x, y: m.y, width, height };

            // Boundary
            if (rect.x < 0 || rect.y < 0 || rect.x + width > gridWidth || rect.y + height > gridHeight) {
                collision = true;
                break;
            }

            // Overlap with existing (stationary) machines
            if (checkCollision(rect, machines)) {
                collision = true;
                break;
            }
        }

        if (collision) {
            // Maybe play error sound? For now, just don't commit.
            return;
        }

        // Move Connections
        const placedConnections = movingConnectionsSnapshot.map(c => ({
            ...c,
            path: c.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
        }));

        // Success: Merge back
        get().takeSnapshot();

        set({
            machines: [...machines, ...placedMachines],
            connections: [...connections, ...placedConnections],
            movingMachinesSnapshot: [],
            movingConnectionsSnapshot: [],
            moveAnchor: null,
            mode: GameMode.BOX_SELECT, // Return to box select?
            selectedMachineIds: placedMachines.map(m => m.id),
            selectedConnectionIds: placedConnections.map(c => c.id),
            isCopying: false
        });
    },

    loadGame: (machines, connections, gridWidth, gridHeight, blueprintId, blueprintName) => {
        // Clear history on new load?
        // User said: "這個紀錄並不保存在藍圖存檔中，所以當我刷新或關閉網頁後，就會重新記錄"
        // Also "refresh or close webpage => re-record".
        // Loading a blueprint effectively resets the session for that blueprint?
        // Usually yes, or we could treat load as a push to history?
        // If I load a save, I probably can't undo "Loading the save" to go back to previous blueprint cleanly 
        // without saving the *previous* state which might be complex.
        // Let's clear history on load for simplicity and safety.
        set({
            machines,
            connections,
            gridWidth,
            gridHeight,
            currentBlueprintId: blueprintId,
            currentBlueprintName: blueprintName,
            mode: GameMode.BUILD,
            selectedMachineId: null,
            movingMachineBackup: null,
            history: { past: [], future: [] }
        });
    },

    setCurrentBlueprint: (id, name) => set({ currentBlueprintId: id, currentBlueprintName: name }),

    resetGame: () => {
        set({
            machines: [],
            connections: [],
            currentBlueprintId: null,
            currentBlueprintName: null,
            mode: GameMode.BUILD,
            selectedMachineId: null,
            movingMachineBackup: null,
            history: { past: [], future: [] }
        });
    }
}));
