import React from 'react';
import { Icon } from '@iconify/react';
import classNames from 'classnames';
import { GameMode } from '../types';
import type { PlacedMachine } from '../types';
import { getMachineConfig } from '../config/machines';
import { useGameStore } from '../store/gameStore';
import './Machine.scss';
import { getRotatedDimensions, getRotatedPorts, isMachinePowered } from '../utils/machineUtils';

interface MachineProps {
    data: PlacedMachine;
    isSelected?: boolean;
}

export const Machine: React.FC<MachineProps> = ({ data, isSelected }) => {
    const config = getMachineConfig(data.machineId);
    const { mode, startWiring, wiringSource, commitWiring, isWiring, zoom, pickupMachine, machines, openMaterialSelector } = useGameStore();
    const pressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    if (!config) return null;

    const { width, height } = getRotatedDimensions(config.width, config.height, data.rotation);
    const inputs = getRotatedPorts(config.inputs, config.width, config.height, data.rotation);
    const outputs = getRotatedPorts(config.outputs, config.width, config.height, data.rotation);

    // 檢查機器是否為「窄型」 (至少一個維度為 1)
    const isNarrowMachine = config.width === 1 || config.height === 1;

    const style = {
        '--x': data.x,
        '--y': data.y,
        '--w': width,
        '--h': height,
    } as React.CSSProperties;

    // 處理材料選擇的點擊事件
    const handleClick = (e: React.MouseEvent) => {
        if (useGameStore.getState().didPan) return; // 拖動畫布手勢結束時的 click 不觸發
        if (mode === GameMode.BUILD) {
            e.stopPropagation();
            openMaterialSelector(data.id);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // 僅允許在建造模式下拾取...
        if (e.button !== 0 || e.altKey) return; // 僅左鍵點擊；Alt+左鍵用於拖動畫布

        pressTimer.current = setTimeout(() => {
            pickupMachine(data.id);
        }, 500);
    };

    const handleMouseUp = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    const handleMouseLeave = () => {
        if (pressTimer.current) {
            clearTimeout(pressTimer.current);
            pressTimer.current = null;
        }
    };

    // ... getPortStyle ...

    const handleInputClick = (e: React.MouseEvent) => {
        if (useGameStore.getState().didPan) return; // 拖動畫布手勢結束時的 click 不觸發
        e.stopPropagation();
        if (mode === GameMode.WIRE && isWiring) {
            commitWiring();
        }
    };

    const getPortStyle = (p: { x: number, y: number, side: 'top' | 'right' | 'bottom' | 'left' }) => {
        const style: React.CSSProperties = {};

        const CELL_SIZE = 40;
        const GAP = 3; // 需與 CSS padding 保持一致
        // 用於緊湊型端口計算位置...

        // Compact Dimensions:
        // Port along-edge size (width for Top/Bottom, height for Left/Right) = 16px
        // Port depth (height for Top/Bottom, width for Left/Right) = 10px

        // 相對於機器主體 (內部 padding) 的中心位置
        const centerOffset = (CELL_SIZE / 2) - GAP;

        // 恢復使用者要求的手動偏移量 -4px
        const axisOffset = -4;

        // We want the center of the port to align with centerOffset.
        // position = centerOffset;
        // But we are setting 'top'/'left', usually indicating start position?
        // Original css has transform: translate(-50%, 0) or (0, -50%), so we are setting the CENTER coordinate.

        switch (p.side) {
            case 'left':
                style.left = `-1px`; // 重疊邊框
                style.top = `${p.y * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(0, -50%)';
                break;
            case 'right':
                style.right = `-0.5px`;
                style.top = `${p.y * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(0, -50%)';
                break;
            case 'top':
                style.top = `-1px`;
                style.left = `${p.x * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(-50%, 0)';
                break;
            case 'bottom':
                style.bottom = `-0.5px`;
                style.left = `${p.x * CELL_SIZE + centerOffset + axisOffset}px`;
                style.transform = 'translate(-50%, 0)';
                break;
        }

        return style;
    };

    // 碰撞檢測輔助函數
    const getPortClasses = (currentPort: { x: number, y: number, side: string }) => {
        const classes: string[] = ['port', currentPort.side];

        // 僅對窄型/小型機器應用智慧調整大小
        if (!isNarrowMachine) return classNames(classes);

        // 尋找同一個格子內的其他端口
        const allPorts = [...inputs, ...outputs];
        const peers = allPorts.filter(p => p.x === currentPort.x && p.y === currentPort.y && p.side !== currentPort.side);

        if (peers.length === 0) {
            return classNames(classes); // 無碰撞，使用標準尺寸
        }

        let shrinkDepth = false; // 對面存在端口
        let shrinkLength = false; // 相鄰存在端口

        const opposites: Record<string, string> = { 'left': 'right', 'right': 'left', 'top': 'bottom', 'bottom': 'top' };

        peers.forEach(peer => {
            if (peer.side === opposites[currentPort.side]) {
                shrinkDepth = true;
            } else {
                // 如果不是對面 (且邊不同)，則必定是相鄰
                shrinkLength = true;
            }
        });

        if (shrinkDepth) classes.push('shrink-depth');
        if (shrinkLength) classes.push('shrink-length');

        return classNames(classes);
    };

    const handleOutputClick = (e: React.MouseEvent, portIndex: number, portRel: { x: number, y: number }) => {
        if (useGameStore.getState().didPan) return; // 拖動畫布手勢結束時的 click 不觸發
        e.stopPropagation();
        if (mode === GameMode.WIRE) {
            // 計算端口的絕對網格座標
            const absX = data.x + portRel.x;
            const absY = data.y + portRel.y;
            startWiring(data.id, portIndex, { x: absX, y: absY });
        }
    };

    // 尋找選中的材料圖標
    let selectedMaterialIcon: number | null = null;
    if (data.selectedMaterialId && config.allowedMaterials) {
        const mat = config.allowedMaterials.find(m => m.id === data.selectedMaterialId);
        if (mat) {
            selectedMaterialIcon = mat.icon;
        }
    }

    return (
        <div
            className={classNames('machine-container', {
                selected: isSelected,
            })}
            style={style}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
        >
            <div className="machine-body">
                <div
                    className="machine-label"
                    style={{
                        transform: `scale(${1 / zoom})`,
                        transformOrigin: 'top left' // 因為我們將其定位在機器的右下角，標籤的錨點為「左上」
                    }}
                >
                    <div>{config.name}</div>
                    <div>[點按] 查看詳情/選擇物品</div>
                    <div>[長按] 移動</div>
                </div>

                {(!isMachinePowered(data, machines, getMachineConfig)) && (
                    <div
                        className="power-alert-icon"
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="No Power"
                    >
                        <Icon
                            icon="uil:battery-bolt"
                            color="var(--orange)"
                            width="36"
                            height="36"
                            style={{ filter: 'drop-shadow(0px 0px 1px var(--orange-dark))' }}
                        />
                    </div>
                )}

                {/* 選中的材料圖標 */}
                {selectedMaterialIcon !== null && (
                    <div
                        className="selected-material-icon"
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            zIndex: 5,
                            pointerEvents: 'none',
                            width: '40px',
                            height: '40px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <img
                            src={new URL(`../assets/items/item_${selectedMaterialIcon}.webp`, import.meta.url).href}
                            alt="Selected Material"
                            style={{
                                maxWidth: '100%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))'
                            }}
                        />
                    </div>
                )}


                {/* 輸入 */}
                {inputs.map((p, i) => (
                    <div
                        key={`in-${i}`}
                        className={classNames(getPortClasses(p), 'input', {
                            clickable: mode === GameMode.WIRE && isWiring
                        })}
                        style={getPortStyle(p)}
                        onClick={handleInputClick}
                        title={mode === GameMode.WIRE && isWiring ? "Click to connect" : ""}
                    >
                        <div className="port-inner">
                            <Icon icon="octicon:chevron-right-12" width="24" height="24" strokeWidth="3" />
                        </div>
                    </div>
                ))}

                {/* 輸出 */}
                {outputs.map((p, i) => (
                    <div
                        key={`out-${i}`}
                        className={classNames(getPortClasses(p), 'output', {
                            clickable: mode === GameMode.WIRE,
                            active: wiringSource?.machineId === data.id && wiringSource.portIndex === i
                        })}
                        style={getPortStyle(p)}
                        onClick={(e) => handleOutputClick(e, i, p)}
                        title={mode === GameMode.WIRE ? "Click to start wiring" : ""}
                    >
                        <div className="port-inner">
                            <Icon icon="octicon:chevron-right-12" width="24" height="24" strokeWidth="3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
