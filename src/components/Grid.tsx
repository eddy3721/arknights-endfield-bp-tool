import React, { useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { Machine } from './Machine';
import { GameMode } from '../types';
import type { Point } from '../types';
import { MACHINES } from '../config/machines';
import classNames from 'classnames';
import './Grid.scss';
import { checkCollision } from '../utils/gridUtils';
import { getRotatedDimensions, getRotatedPorts } from '../utils/machineUtils';

const GRID_SIZE = 40; // 需與 CSS 中的 --grid-size 保持一致

export const Grid = () => {
    const {
        machines,
        connections,
        mode,
        selectedMachineId,
        addMachine,
        isWiring,
        updateWiringPreview,
        wiringPreviewPath,
        isWiringValid,
        previewRotation,
        rotatePreview,
        zoom,
        gridWidth,
        gridHeight,

        setZoom,
        pan,
        setPan,

        // 框選 / 批量移動
        setBoxSelection,
        commitBoxSelection,
        selectionStart,
        selectionEnd,
        selectedMachineIds,
        selectedConnectionIds,

        startBatchMove,
        startCopySelection,
        commitBatchMove,
        deleteSelected,

        moveAnchor,
        movingMachinesSnapshot,
        movingConnectionsSnapshot,
        cancelOperation
    } = useGameStore();

    const containerRef = useRef<HTMLDivElement>(null);
    const [isPanning, setIsPanning] = React.useState(false);
    const lastMousePos = useRef<Point>({ x: 0, y: 0 });

    // 快捷鍵 E 和 R
    const setMode = useGameStore(s => s.setMode);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isPlacing = !!useGameStore.getState().selectedMachineId;

            if (e.key.toLowerCase() === 'e') {
                if (isPlacing) return;
                setMode(mode === GameMode.WIRE ? GameMode.BUILD : GameMode.WIRE);
            } else if (e.key.toLowerCase() === 'r') {
                rotatePreview();
            } else if (e.key.toLowerCase() === 'x') {
                if (isPlacing) return;
                setMode(mode === GameMode.BOX_SELECT ? GameMode.BUILD : GameMode.BOX_SELECT);
            } else if (e.key.toLowerCase() === 'f') {
                deleteSelected();
                // 使用者需求：按 F1 開啟藍圖列表
                // 注意：F1 通常會開啟說明，我們可能需要阻止預設行為
            } else if (e.key === 'F1') {
                e.preventDefault();
                useGameStore.getState().setBlueprintListMode('insert');
                useGameStore.getState().setUiView('list');
            } else if (e.key.toLowerCase() === 'm') {
                // 我們需要 hoverPos 作為錨點。由於無法在此監聽器中輕鬆存取 react state...
                // 實際上，如果我們使用 ref 來儲存 hoverPos，是可以運作的。
                if (hoverPosRef.current) {
                    startBatchMove(hoverPosRef.current);
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                if (hoverPosRef.current) {
                    startCopySelection(hoverPosRef.current);
                }
            } else if (e.key === 'Escape') {
                cancelOperation();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, setMode, rotatePreview, deleteSelected, startBatchMove, cancelOperation]);

    const getGridPos = (e: React.MouseEvent): Point => {
        if (!containerRef.current) return { x: 0, y: 0 };
        const rect = containerRef.current.getBoundingClientRect();
        // 調整縮放和平移
        // 視覺變換順序：scale(zoom) translate(pan)
        // 螢幕座標 = (世界座標 * zoom) + pan
        // 世界座標 = (螢幕座標 - pan) / zoom

        const x = Math.floor(((e.clientX - rect.left) - pan.x) / (GRID_SIZE * zoom));
        const y = Math.floor(((e.clientY - rect.top) - pan.y) / (GRID_SIZE * zoom));
        return { x, y };
    };

    const hoverPosRef = useRef<Point | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        // 滑鼠中鍵 (1)，或 Alt+左鍵/右鍵 (觸控板適用)：拖動畫布
        // 以 mousedown 當下判定手勢並記錄，因為放開時 Alt 可能已先鬆開，
        // click/contextmenu 不能依賴 e.altKey
        const isPanGesture = e.button === 1 || (e.altKey && (e.button === 0 || e.button === 2));
        useGameStore.setState({ didPan: isPanGesture });
        if (isPanGesture) {
            e.preventDefault();
            setIsPanning(true);
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const pos = getGridPos(e);

        if (mode === GameMode.BOX_SELECT && e.button === 0) {
            setBoxSelection(pos, pos);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        setIsPanning(false);
        if (mode === GameMode.BOX_SELECT && selectionStart) {
            commitBoxSelection(e.shiftKey);
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        // 僅在我們想要阻止頁面滾動時阻止預設行為 (通常適用於可縮放畫布)
        if (e.ctrlKey || e.metaKey) {
            // 瀏覽器縮放交互，也許讓它發生？
            // 標準地圖行為：僅滾輪縮放
        }

        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 1. 在縮放前計算滑鼠下的世界座標
        const worldX = (mouseX - pan.x) / zoom;
        const worldY = (mouseY - pan.y) / zoom;

        const delta = -Math.sign(e.deltaY) * 0.1;
        const newZoom = Math.min(Math.max(zoom + delta, 0.18), 3.0);

        // 2. 計算新的平移量以保持世界座標在滑鼠下方
        // mouseX = worldX * newZoom + newPanX
        // newPanX = mouseX - worldX * newZoom
        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
    };

    const [hoverPos, setHoverPos] = React.useState<Point | null>(null);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            const deltaX = e.clientX - lastMousePos.current.x;
            const deltaY = e.clientY - lastMousePos.current.y;

            setPan({
                x: pan.x + deltaX,
                y: pan.y + deltaY
            });

            lastMousePos.current = { x: e.clientX, y: e.clientY };
            return;
        }

        const pos = getGridPos(e);
        setHoverPos(pos);
        hoverPosRef.current = pos;

        if (isWiring) {
            updateWiringPreview(pos);
        }

        if (mode === GameMode.BOX_SELECT && selectionStart && e.buttons === 1) {
            setBoxSelection(selectionStart, pos);
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        // 拖動畫布手勢結束時觸發的 click 不執行任何操作
        // (不能檢查 isPanning：mouseUp 已先將其清除，click 時恆為 false)
        if (useGameStore.getState().didPan) return;

        const pos = getGridPos(e);

        if (mode === GameMode.BUILD && selectedMachineId) {
            addMachine(selectedMachineId, pos.x, pos.y, previewRotation);
            // 如果未按住 Ctrl，取消選擇機器
            if (!e.ctrlKey) {
                useGameStore.getState().selectMachine(null);
            }
        } else if (mode === GameMode.WIRE && isWiring) {
            // 檢查是否點擊了機器輸入/輸出，這由 Port onClick 處理。
            // 如果執行到這裡，表示我們點擊了網格背景 (或沒有點擊到端口的機器本體)。
            useGameStore.getState().addWiringAnchor(pos);
        } else if (mode === GameMode.MOVE_SELECTION) {
            commitBatchMove(pos);
        } else if (mode === GameMode.BOX_SELECT) {
            // 點擊是否清除選取？
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        // Alt+右鍵拖動畫布時不取消操作 (Windows 的 contextmenu 在 mouseup 才觸發，
        // 屆時 Alt 可能已鬆開，故檢查 didPan 而非 e.altKey)
        if (useGameStore.getState().didPan) return;
        useGameStore.getState().cancelOperation();
    };

    // 預覽機器計算
    const ghostConfig = (mode === GameMode.BUILD && selectedMachineId) ? MACHINES.find(m => m.id === selectedMachineId) : null;
    let isGhostInvalid = false;
    let ghostWidth = 0;
    let ghostHeight = 0;
    let ghostPorts: any[] = [];

    if (ghostConfig && hoverPos) {
        const dims = getRotatedDimensions(ghostConfig.width, ghostConfig.height, previewRotation);
        ghostWidth = dims.width;
        ghostHeight = dims.height;

        const candidate = {
            x: hoverPos.x,
            y: hoverPos.y,
            width: ghostWidth,
            height: ghostHeight
        };

        const isOutOfBounds = candidate.x < 0 || candidate.y < 0 ||
            candidate.x + candidate.width > gridWidth ||
            candidate.y + candidate.height > gridHeight;

        isGhostInvalid = isOutOfBounds || checkCollision(candidate, machines);

        ghostPorts = getRotatedPorts(
            [...ghostConfig.inputs, ...ghostConfig.outputs],
            ghostConfig.width,
            ghostConfig.height,
            previewRotation
        ).map((p, i) => ({
            ...p,
            isInput: i < ghostConfig.inputs.length // 保留輸入端口資訊
        }));
    }

    return (
        <div
            className={classNames('grid-container', { 'wiring-mode': mode === GameMode.WIRE, 'panning': isPanning })}
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setHoverPos(null); setIsPanning(false); }}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
        >
            <div
                className="zoom-content"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                    width: '100%',
                    height: '100%'
                }}
            >
                <div
                    className="grid-background"
                    style={{
                        width: gridWidth * GRID_SIZE,
                        height: gridHeight * GRID_SIZE
                    }}
                />

                {/* 連線 SVG 圖層 */}
                <svg
                    className="connections-layer"
                    style={{
                        width: gridWidth * GRID_SIZE,
                        height: gridHeight * GRID_SIZE,
                        pointerEvents: 'none', // Ensure clicks pass through to grid
                    }}
                >
                    {/* 已確認連線 - 外框 */}
                    {connections.map(conn => (
                        <polyline
                            key={`${conn.id}-outline`}
                            points={conn.path.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ')}
                            className={classNames('conveyor-line-outline', { selected: selectedConnectionIds.includes(conn.id) })}
                        />
                    ))}
                    {/* 已確認連線 - 內填 */}
                    {connections.map(conn => (
                        <polyline
                            key={`${conn.id}-fill`}
                            points={conn.path.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ')}
                            className={classNames('conveyor-line-fill', { selected: selectedConnectionIds.includes(conn.id) })}
                        />
                    ))}

                    {/* 連線預覽 - 外框 */}
                    {isWiring && wiringPreviewPath.length > 0 && (
                        <polyline
                            points={wiringPreviewPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ')}
                            className={classNames('conveyor-preview-outline', { 'invalid': !isWiringValid })}
                        />
                    )}
                    {/* 連線預覽 - 內填 */}
                    {isWiring && wiringPreviewPath.length > 0 && (
                        <polyline
                            points={wiringPreviewPath.map(p => `${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`).join(' ')}
                            className={classNames('conveyor-preview-fill', { 'invalid': !isWiringValid })}
                        />
                    )}

                    {/* 預覽終點標記 */}
                    {isWiring && wiringPreviewPath.length > 0 && (
                        <circle
                            cx={wiringPreviewPath[wiringPreviewPath.length - 1].x * GRID_SIZE + GRID_SIZE / 2}
                            cy={wiringPreviewPath[wiringPreviewPath.length - 1].y * GRID_SIZE + GRID_SIZE / 2}
                            r="4"
                            fill="white"
                        />
                    )}
                </svg>

                {/* 機器圖層 */}
                {machines.map(m => (
                    <Machine
                        key={m.id}
                        data={m}
                        isSelected={selectedMachineIds.includes(m.id)}
                    />
                ))}

                {/* 選取框 */}
                {selectionStart && selectionEnd && mode === GameMode.BOX_SELECT && (() => {
                    const x1 = Math.min(selectionStart.x, selectionEnd.x);
                    const y1 = Math.min(selectionStart.y, selectionEnd.y);
                    const x2 = Math.max(selectionStart.x, selectionEnd.x);
                    const y2 = Math.max(selectionStart.y, selectionEnd.y);
                    const width = (x2 - x1) + 1;
                    const height = (y2 - y1) + 1;

                    return (
                        <div
                            className="selection-box"
                            style={{
                                left: x1 * GRID_SIZE,
                                top: y1 * GRID_SIZE,
                                width: width * GRID_SIZE,
                                height: height * GRID_SIZE
                            }}
                        />
                    );
                })()}

                {/* 批量移動預覽 - 連線 */}
                {mode === GameMode.MOVE_SELECTION && moveAnchor && hoverPos && (() => {
                    const offsetX = hoverPos.x - moveAnchor.x;
                    const offsetY = hoverPos.y - moveAnchor.y;

                    return (
                        <svg
                            className="connections-layer"
                            style={{
                                width: gridWidth * GRID_SIZE,
                                height: gridHeight * GRID_SIZE,
                                pointerEvents: 'none',
                                zIndex: 12
                            }}
                        >
                            {movingConnectionsSnapshot.map(conn => {
                                const newPath = conn.path.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
                                const pointsStr = newPath.map(p => (`${p.x * GRID_SIZE + GRID_SIZE / 2},${p.y * GRID_SIZE + GRID_SIZE / 2}`)).join(' ');
                                return (
                                    <React.Fragment key={`ghost-conn-${conn.id}`}>
                                        <polyline
                                            points={pointsStr}
                                            className="conveyor-line-outline"
                                            style={{ opacity: 0.5 }}
                                        />
                                        <polyline
                                            points={pointsStr}
                                            className="conveyor-line-fill"
                                            style={{ opacity: 0.5 }}
                                        />
                                    </React.Fragment>
                                );
                            })}
                        </svg>
                    )
                })()}

                {/* 批量移動預覽 - 機器 */}
                {mode === GameMode.MOVE_SELECTION && moveAnchor && hoverPos && movingMachinesSnapshot.map(m => {
                    const offsetX = hoverPos.x - moveAnchor.x;
                    const offsetY = hoverPos.y - moveAnchor.y;
                    const ghostX = m.x + offsetX;
                    const ghostY = m.y + offsetY;

                    return (
                        <div key={`ghost-${m.id}`} style={{ opacity: 0.6, pointerEvents: 'none', zIndex: 20 }}>
                            <Machine
                                data={{ ...m, x: ghostX, y: ghostY }}
                                isSelected={true} // 高亮顯示
                            />
                        </div>
                    );
                })}

                {/* 機器預覽 (單個) */}
                {ghostConfig && hoverPos && (
                    <>
                        {ghostConfig.supplyRange && (
                            <div
                                style={{
                                    left: (hoverPos.x + (ghostWidth / 2) - (ghostConfig.supplyRange / 2)) * GRID_SIZE,
                                    top: (hoverPos.y + (ghostHeight / 2) - (ghostConfig.supplyRange / 2)) * GRID_SIZE,
                                    width: ghostConfig.supplyRange * GRID_SIZE,
                                    height: ghostConfig.supplyRange * GRID_SIZE,
                                    position: 'absolute',
                                    border: '2px dashed #ffcc00',
                                    backgroundColor: 'rgba(255, 204, 0, 0.2)',
                                    pointerEvents: 'none',
                                    zIndex: 5
                                }}
                            />
                        )}
                        <div
                            className={classNames('machine-ghost', { 'invalid-placement': isGhostInvalid })}
                            style={{
                                left: hoverPos.x * GRID_SIZE,
                                top: hoverPos.y * GRID_SIZE,
                                width: ghostWidth * GRID_SIZE,
                                height: ghostHeight * GRID_SIZE,
                            } as React.CSSProperties}
                        />
                        {/* 預覽箭頭 */}
                        {ghostPorts.map((p, i) => {
                            let arrowX = hoverPos.x + p.x;
                            let arrowY = hoverPos.y + p.y;
                            let rotation = 0;
                            const isInput = p.isInput;

                            // 根據方向向外延伸 1 格
                            switch (p.side) {
                                case 'left':
                                    arrowX -= 1;
                                    rotation = isInput ? 0 : 180; // 輸入：指向機器，輸出：背向機器
                                    break;
                                case 'right':
                                    arrowX += 1; // 因為 p.x 是內部座標
                                    rotation = isInput ? 180 : 0;
                                    break;
                                case 'top':
                                    arrowY -= 1;
                                    rotation = isInput ? 90 : 270;
                                    break;
                                case 'bottom':
                                    arrowY += 1;
                                    rotation = isInput ? 270 : 90;
                                    break;
                            }

                            return (
                                <div
                                    key={`ghost-arrow-${i}`}
                                    className={classNames('ghost-arrow', isInput ? 'input-arrow' : 'output-arrow')}
                                    style={{
                                        left: arrowX * GRID_SIZE,
                                        top: arrowY * GRID_SIZE,
                                        transform: `rotate(${rotation}deg)`
                                    } as React.CSSProperties}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 6 15 12 9 18"></polyline>
                                    </svg>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

        </div>
    );
};
