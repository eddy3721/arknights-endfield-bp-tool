# 菲比拉基建-終末地藍圖工具

一個專為《明日方舟：終末地》設計的網頁版基建規劃工具，協助玩家規劃工廠佈局與管理藍圖。

**[體驗網址 (Live Demo)](https://zmd-bp-tool.pages.dev/)**

## 主要功能 (Key Features)

*   **可視化編輯器 (Visual Editor)**：直觀的網格系統，支援機器的放置、旋轉與傳送帶連接。
*   **藍圖系統 (Blueprint System)**：支援藍圖的保存、讀取，並可透過 URL 生成分享連結，與其他玩家分享您的設計。
*   **智慧工具 (Smart Tools)**：提供框選、批量移動、批量刪除、複製與貼上等操作。

## 技術棧 (Tech Stack)

本專案使用以下技術構建：

*   [React 19](https://react.dev/)
*   [TypeScript](https://www.typescriptlang.org/)
*   [Vite](https://vitejs.dev/)
*   [Chakra UI](https://chakra-ui.com/)
*   [Zustand](https://zustand-demo.pmnd.rs/) (State Management)
*   [Framer Motion](https://www.framer.com/motion/)

## 快速開始 (Getting Started)

### 前置需求

確保您的電腦已安裝 [Node.js](https://nodejs.org/)。

### 安裝與執行

1.  克隆專案或下載原始碼。
2.  安裝依賴套件：
    ```bash
    npm install
    ```
3.  啟動開發伺服器：
    ```bash
    npm run dev
    ```

## 操作指南 (Operation Guide)

以下是編輯器中常用的快捷鍵與操作方式：

| 模式/情境 | 快捷鍵 / 操作 | 功能描述 |
| :--- | :--- | :--- |
| **通用** | `Middle Click` (按住) | 移動畫布 |
| | `Alt` + `Left/Right Click` (按住) | 移動畫布 (觸控板適用) |
| | `Scroll` | 縮放畫布 |
| | `Ctrl` + `Z` | 撤銷 (Undo) |
| | `Ctrl` + `Shift` + `Z` / `Ctrl` + `Y` | 復原 (Redo) |
| | `Ctrl` + `S` | 保存 / 另存藍圖 |
| **建造模式** | `E` | 切換至傳送帶模式 |
| | `X` | 切換至框選模式 |
| | `F1` | 插入藍圖 |
| **機器放置** | `R` | 旋轉設備 |
| | `Left Click` | 確定擺放 |
| | `Right Click` | 取消擺放 |
| | `Ctrl` + `Left Click` | 連續擺放 |
| **連線模式** | `Left Click` | 確定起點 / 終點 |
| | `Right Click` | 取消連線 |
| **選取狀態** | `M` | 批量移動 |
| | `F` | 批量刪除 |
| | `Ctrl` + `C` | 複製選取內容 |
| **框選模式** | `Left Click` (拖曳) | 框選區域 |
| | `Shift` + `Left Click` (拖曳) | 加選 / 減選 |

## 授權 (License)

本專案程式碼採用 [MIT License](LICENSE) 授權。

## 免責聲明 (Asset Disclaimer)

所有遊戲相關圖像與商標權歸原廠所有。

*   本工具僅為玩家社群製作的輔助工具，與遊戲官方無任何關聯。
*   本工具不進行任何商業營利行為。若有任何侵權問題，請聯繫作者信箱進行刪除或更換。

## 作者 (Credits)

*   **Author**: 大木
