import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const baseUrl = process.env.V39_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(baseUrl, { waitUntil:"networkidle" });
  await page.waitForFunction(() => (
    typeof window.startV39LocalSession === "function"
    && typeof window.generateV39TestFieldWithSeed === "function"
    && typeof window.advanceV39Turn === "function"
  ));
  const report = await page.evaluate(async () => {
    const confirmations = [];
    window.confirm = message => { confirmations.push(message); return true; };
    window.startV39LocalSession(1, { playMode:"single-test" });
    const field = window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "settlement-development-check");
    const state = window.getV39GameState();
    const player = state.players.find(row => row.id === state.activePlayerId);
    const sourceVillage = {
      id:"development-source",
      settlementId:"development-source",
      name:"発展試験元",
      x:4,
      y:4,
      placed:true,
      population:150,
      populationByRace:{ 只人:150 },
      foodStockByType:{ 穀物:1000, 野菜:1000, 肉:1000, 魚:1000 },
      materialStockByType:{ 木材:1000, 黒木:1000, 特木:1000, 石材:1000, 鉄:1000, 銀鉄:1000, 青金鋼:1000, 赤黒鋼:1000, 金:1000, 銀:1000, 宝石:1000 },
      buildings:[],
      tileFacilityMap:{},
      constructionQueue:[]
    };
    const firstCenter = `${sourceVillage.x},${sourceVillage.y}`;
    const firstAttached = `${sourceVillage.x + 1},${sourceVillage.y}`;
    field.grid[sourceVillage.y][sourceVillage.x + 1] = "海";
    const secondX = Math.min(field.w - 3, sourceVillage.x + 4);
    const secondY = sourceVillage.y;
    const secondCenter = `${secondX},${secondY}`;
    const secondAttached = `${secondX + 1},${secondY}`;
    const makeVillage = (base, id, name, x, y, residentialTileKeys, withProject = true) => ({
      ...structuredClone(base),
      id,
      settlementId:id,
      name,
      x,
      y,
      placed:true,
      type:"村",
      scaleKey:"village",
      scaleLevel:1,
      population:150,
      populationByRace:{ 只人:150 },
      lastEconomyDelta:null,
      territoryTileModeMap:Object.fromEntries(residentialTileKeys.map(key => [key, "settlement"])),
      territoryResidentialLevelMap:{ [residentialTileKeys[0]]:"village" },
      territoryResidentialCenterMap:{ [residentialTileKeys[0]]:residentialTileKeys[0] },
      developmentProject:withProject ? {
        targetScaleKey:"town",
        targetScaleLevel:2,
        remainingTurns:2,
        totalTurns:2,
        startedTurn:state.timeline.turnNumber,
        residentialTileKeys
      } : null
    });
    const firstVillage = {
      ...makeVillage(sourceVillage, "development-a", "発展試験A", sourceVillage.x, sourceVillage.y, [firstCenter, firstAttached], false),
      buildings:["農場"],
      tileFacilityMap:{ [firstCenter]:["農場"] }
    };
    const secondVillage = makeVillage(sourceVillage, "development-b", "発展試験B", secondX, secondY, [secondCenter, secondAttached]);
    const completionEvents = [];
    window.addEventListener("v39:settlement-development-completed", event => completionEvents.push(event.detail), { once:false });
    window.setV39GameState({
      players:state.players.map(row => row.id !== player.id ? row : ({
        ...row,
        race:"只人",
        factionState:{
          ...row.factionState,
          settlements:[firstVillage, secondVillage],
          selectedSettlementId:firstVillage.id,
          villagePlacementMode:false
        }
      })),
      settlements:[
        { id:firstVillage.id, settlementId:firstVillage.id, name:firstVillage.name, x:firstVillage.x, y:firstVillage.y, type:"村", population:150 },
        { id:secondVillage.id, settlementId:secondVillage.id, name:secondVillage.name, x:secondVillage.x, y:secondVillage.y, type:"村", population:150 }
      ],
      territoryOwnerByTile:{
        ...state.territoryOwnerByTile,
        [firstCenter]:player.id,
        [firstAttached]:player.id,
        [secondCenter]:player.id,
        [secondAttached]:player.id
      },
      territoryStateByTile:{
        ...state.territoryStateByTile,
        [firstCenter]:{ settlementId:firstVillage.id },
        [firstAttached]:{ settlementId:firstVillage.id },
        [secondCenter]:{ settlementId:secondVillage.id },
        [secondAttached]:{ settlementId:secondVillage.id }
      }
    }, { reason:"settlement-development-check-setup" });

    const occupiedFacilityCheck = window.inspectV39Construction?.("兵舎", {
      x:sourceVillage.x,
      y:sourceVillage.y,
      terrain:"平地",
      special:""
    });

    document.querySelector('[data-foot="settlement"]')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    document.querySelector("[data-settlement-development]")?.click();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const startButton = document.querySelector("#v39-development-start");
    const startButtonEnabled = startButton instanceof HTMLButtonElement && !startButton.disabled;
    startButton?.click();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const selectionBefore = window.getV39SettlementDevelopmentSelection?.();
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x:sourceVillage.x + 1, y:sourceVillage.y } }));
    await new Promise(resolve => window.setTimeout(resolve, 80));
    const selectionAfter = window.getV39SettlementDevelopmentSelection?.();
    const selectionScene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
    const selectionLayer = selectionScene?.children?.list?.find(child => child?.name === "v39-development-selection-layer");
    const renderedSelectionCount = selectionLayer?.getData?.("selectedCount") ?? null;
    document.querySelector('[data-development-selection-action="confirm"]')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const startedState = window.getV39GameState();
    const startedVillage = startedState.players.find(row => row.id === player.id).factionState.settlements.find(row => row.settlementId === firstVillage.id);
    document.querySelector("#buildModal [data-close]")?.click();
    window.setV39GameState({
      players:startedState.players.map(row => row.id !== player.id ? row : ({
        ...row,
        factionState:{
          ...row.factionState,
          settlements:row.factionState.settlements.map(village => village.settlementId === firstVillage.id ? ({
            ...village,
            lastEconomyDelta:null,
            developmentProject:{ ...village.developmentProject, remainingTurns:2, totalTurns:2 }
          }) : village)
        }
      }))
    }, { reason:"settlement-development-check-shortened-project" });

    const originalEnemyTurn = window.runV39EnemyTurn;
    window.runV39EnemyTurn = async () => {};
    await window.advanceV39Turn();
    const afterOneTurn = window.getV39GameState();
    const firstTurnVillages = afterOneTurn.players.find(row => row.id === player.id).factionState.settlements;
    await window.advanceV39Turn();
    const completedState = window.getV39GameState();
    window.runV39EnemyTurn = originalEnemyTurn;
    const completedVillages = completedState.players.find(row => row.id === player.id).factionState.settlements;
    const firstCompleted = completedVillages.find(row => row.settlementId === firstVillage.id);
    const secondCompleted = completedVillages.find(row => row.settlementId === secondVillage.id);
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const completedWorldSettlement = completedState.settlements.find(row => row.id === firstVillage.id);
    const scene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
    const settlementMarkers = (scene?.children?.list || [])
      .flatMap(child => Array.isArray(child?.list) ? child.list : [])
      .filter(child => child?.name === "v39-settlement-marker");
    const markerEntries = settlementMarkers.map(marker => ({
      marker,
      image:(Array.isArray(marker?.list) ? marker.list : [])
        .find(child => String(child?.texture?.key || "").includes("v39-settlement:")) || null
    }));
    const firstMarkerEntry = markerEntries.find(entry => String(entry.image?.texture?.key || "").includes("町"))
      || markerEntries[0]
      || {};
    const firstMarkerTextureKey = firstMarkerEntry.image?.texture?.key || "";
    document.querySelector('[data-foot="settlement"]')?.click();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const developmentButton = document.querySelector("[data-settlement-development]");
    developmentButton?.click();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const developmentModal = document.querySelector("#buildModal.open");
    const uiReport = {
      hasButton:developmentButton instanceof HTMLButtonElement,
      buttonText:developmentButton?.textContent?.trim() || "",
      modalVisible:developmentModal instanceof HTMLElement,
      modalTitle:developmentModal?.querySelector("h2")?.textContent?.trim() || "",
      modalText:developmentModal?.textContent || ""
    };
    document.querySelector("#buildModal [data-close]")?.click();

    const conversionKey = `${firstCompleted.x},${firstCompleted.y + 1}`;
    const beforeConversion = window.getV39GameState();
    window.setV39GameState({
      players:beforeConversion.players.map(row => row.id !== player.id ? row : ({
        ...row,
        factionState:{
          ...row.factionState,
          settlements:row.factionState.settlements.map(village => village.settlementId !== firstVillage.id ? village : ({
            ...village,
            lastEconomyDelta:null,
            territoryTileModeMap:{ ...village.territoryTileModeMap, [conversionKey]:"resource" },
            buildings:[...village.buildings, "倉庫"],
            tileFacilityMap:{ ...village.tileFacilityMap, [conversionKey]:["倉庫"] },
            facilityStateByTile:{ ...village.facilityStateByTile, [conversionKey]:{ 倉庫:{ hp:100, maxHp:100 } } },
            constructionQueue:[{ facilityName:"兵舎", tileKey:conversionKey, remainingTurns:5, totalTurns:5 }],
            territoryTileConversionMap:{}
          }))
        }
      })),
      territoryOwnerByTile:{ ...beforeConversion.territoryOwnerByTile, [conversionKey]:player.id },
      territoryStateByTile:{ ...beforeConversion.territoryStateByTile, [conversionKey]:{ settlementId:firstVillage.id } }
      ,facilitiesByTile:{ ...beforeConversion.facilitiesByTile, [conversionKey]:["倉庫"] }
    }, { reason:"settlement-conversion-check-setup" });
    document.querySelector('[data-foot="tile"]')?.click();
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x:firstCompleted.x, y:firstCompleted.y + 1 } }));
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const conversionButton = document.getElementById("v39-land-settlement-convert");
    const conversionButtonEnabled = conversionButton instanceof HTMLButtonElement && !conversionButton.disabled;
    window.confirm = message => { confirmations.push(message); return false; };
    conversionButton?.click();
    const conversionCancelled = !window.getV39GameState().players.find(row => row.id === player.id).factionState.settlements.find(row => row.settlementId === firstVillage.id).territoryTileConversionMap[conversionKey];
    window.confirm = message => { confirmations.push(message); return true; };
    conversionButton?.click();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const conversionStartedState = window.getV39GameState();
    const conversionStartedVillage = conversionStartedState.players.find(row => row.id === player.id).factionState.settlements.find(row => row.settlementId === firstVillage.id);
    await new Promise(resolve => window.setTimeout(resolve, 80));
    const conversionScene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
    const conversionStructure = conversionScene?.children?.list?.find(child => child?.name === "v39-structure-layer");
    const conversionMarker = conversionStructure?.list?.find(child => child?.name === "v39-tile-conversion-marker" && child?.getData?.("tileKey") === conversionKey);
    const conversionMarkerLabel = conversionMarker?.getData?.("label") || "";
    const turnText = conversionMarker?.getData?.("turnLabel");
    const turnFontSize = parseFloat(turnText?.style?.fontSize || "0");
    const constructionPreview = conversionStructure?.list?.find(child => child.name === "v39-residential-construction-preview" && child.getData("tileKey") === conversionKey);
    const constructionPreviewImage = constructionPreview?.list?.find(child => child.name === "v39-residential-village-image");
    const pendingConstructionCheck = window.inspectV39Construction("教会", { x:firstCompleted.x, y:firstCompleted.y + 1 });
    window.runV39EnemyTurn = async () => {};
    await window.advanceV39Turn();
    const conversionFirstTurnState = window.getV39GameState();
    const conversionFirstTurnVillage = conversionFirstTurnState.players.find(row => row.id === player.id).factionState.settlements.find(row => row.settlementId === firstVillage.id);
    await window.advanceV39Turn();
    window.runV39EnemyTurn = originalEnemyTurn;
    const conversionCompletedState = window.getV39GameState();
    const conversionCompletedVillage = conversionCompletedState.players.find(row => row.id === player.id).factionState.settlements.find(row => row.settlementId === firstVillage.id);
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const latestScene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
    const residentialLayer = latestScene?.children?.list?.find(child => child?.name === "v39-residential-tile-layer");
    const latestStructure = latestScene?.children?.list?.find(child => child?.name === "v39-structure-layer");
    const facilityMarker = latestStructure?.list?.find(child => child?.name === "v39-facility-marker" && child?.getData?.("facilityName") === "農場");
    const facilityIcon = facilityMarker?.list?.find(child => child?.name === "v39-facility-icon-image");
    const residentialVillageMarker = latestStructure?.list?.find(child => child?.name === "v39-residential-village-marker" && child?.getData?.("tileKey") === conversionKey);
    const residentialVillageIcon = residentialVillageMarker?.list?.find(child => child?.name === "v39-residential-village-image");
    const latestTownMarker = (latestScene?.children?.list || [])
      .flatMap(child => Array.isArray(child?.list) ? child.list : [])
      .find(marker => marker?.name === "v39-settlement-marker"
        && (Array.isArray(marker?.list) ? marker.list : []).some(child => String(child?.texture?.key || "").includes("町")));
    if (latestTownMarker && latestScene?.cameras?.main) {
      latestScene.cameras.main.centerOn(latestTownMarker.x, latestTownMarker.y);
      latestScene.cameras.main.setZoom(1.8);
    }
    return {
      afterOneTurn:firstTurnVillages.map(row => ({
        id:row.settlementId,
        scaleKey:row.scaleKey,
        remainingTurns:row.developmentProject?.remainingTurns ?? null
      })),
      completed:completedVillages.map(row => ({
        id:row.settlementId,
        scaleKey:row.scaleKey,
        scaleLevel:row.scaleLevel,
        type:row.type,
        hasProject:!!row.developmentProject
      })),
      firstResidential:{
        center:firstCompleted?.territoryResidentialLevelMap?.[firstCenter],
        attached:firstCompleted?.territoryResidentialLevelMap?.[firstAttached],
        owner:firstCompleted?.territoryResidentialCenterMap?.[firstAttached]
      },
      secondResidential:{
        center:secondCompleted?.territoryResidentialLevelMap?.[secondCenter],
        attached:secondCompleted?.territoryResidentialLevelMap?.[secondAttached],
        owner:secondCompleted?.territoryResidentialCenterMap?.[secondAttached]
      },
      worldSettlement:{
        scaleKey:completedWorldSettlement?.scaleKey || "",
        scaleLevel:completedWorldSettlement?.scaleLevel || 0,
        type:completedWorldSettlement?.type || "",
        occupiedCount:Object.values(completedWorldSettlement?.territoryResidentialCenterMap || {})
          .filter(centerKey => centerKey === firstCenter).length,
        markerTextureKey:firstMarkerTextureKey,
        markerWidth:firstMarkerEntry.image?.displayWidth || 0,
        markerHeight:firstMarkerEntry.image?.displayHeight || 0
      },
      completionCount:completionEvents.flatMap(row => row?.completed || []).length,
      turnNumber:completedState.timeline.turnNumber,
      started:{
        buttonEnabled:startButtonEnabled,
        selectionBeforeCount:selectionBefore?.selectedTileKeys?.length || 0,
        selectionAfterCount:selectionAfter?.selectedTileKeys?.length || 0,
        selectionCandidateCount:selectionAfter?.candidateTileKeys?.length || 0,
        selectedTerrain:field.grid[sourceVillage.y][sourceVillage.x + 1],
        renderedSelectionCount,
        targetScaleKey:startedVillage?.developmentProject?.targetScaleKey || "",
        totalTurns:startedVillage?.developmentProject?.totalTurns || 0,
        baseBuildTurns:startedVillage?.developmentProject?.baseBuildTurns || 0,
        reusedResidentialTileCount:startedVillage?.developmentProject?.reusedResidentialTileCount || 0,
        turnReduction:startedVillage?.developmentProject?.turnReduction || 0,
        wood:startedVillage?.materialStockByType?.木材
      },
      occupiedFacilityCheck:{
        available:occupiedFacilityCheck?.available ?? null,
        reasons:occupiedFacilityCheck?.reasons || []
      },
      ui:uiReport,
      conversion:{
        cancelledWithoutChanges:conversionCancelled,
        confirmationMentionsRemoval:confirmations.some(message => message.includes("倉庫") && message.includes("戻りません")),
        tileKey:conversionKey,
        facilityRemoved:!conversionCompletedVillage.tileFacilityMap[conversionKey] && !conversionCompletedVillage.facilityStateByTile[conversionKey] && !conversionCompletedVillage.buildings.includes("倉庫") && !conversionCompletedState.facilitiesByTile[conversionKey],
        constructionRemoved:!conversionCompletedVillage.constructionQueue.some(item => item.tileKey === conversionKey),
        constructionBlockedDuringConversion:pendingConstructionCheck.reasons.includes("土地用途を変更中です"),
        hasButton:conversionButton instanceof HTMLButtonElement,
        buttonEnabled:conversionButtonEnabled,
        startedRemaining:conversionStartedVillage?.territoryTileConversionMap?.[conversionKey]?.remainingTurns ?? null,
        startedMarkerLabel:conversionMarkerLabel,
        turnFontSize,
        turnLabel:turnText?.text,
        turnAboveCenter:turnText?.y < conversionMarker?.y,
        previewAlpha:constructionPreviewImage?.alpha,
        townCapacity:firstCompleted?.populationCapacity ?? null,
        resourceCapacity:conversionFirstTurnVillage?.populationCapacity ?? null,
        settlementCapacity:conversionCompletedVillage?.populationCapacity ?? null,
        completedMode:conversionCompletedVillage?.territoryTileModeMap?.[conversionKey] || "",
        hasQueue:!!conversionCompletedVillage?.territoryTileConversionMap?.[conversionKey],
        renderedResidentialTiles:residentialLayer?.getData?.("tileCount") ?? null,
        facilityMarkerLabel:facilityMarker?.getData?.("label") || "",
        facilityMarkerIconFrame:facilityMarker?.getData?.("iconFrame") || "",
        facilityMarkerTextureKey:facilityIcon?.texture?.key || "",
        facilityMarkerDisplaySize:Math.round(Math.max(Number(facilityIcon?.displayWidth) || 0, Number(facilityIcon?.displayHeight) || 0)),
        residentialVillageTextureKey:residentialVillageIcon?.texture?.key || "",
        residentialVillageDisplaySize:Math.round(Math.max(Number(residentialVillageIcon?.displayWidth) || 0, Number(residentialVillageIcon?.displayHeight) || 0))
      }
    };
  });

  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.screenshot({ path:"output/web-game/v39-settlement-development.png", fullPage:true });
  report.reversal = await page.evaluate(async tileKey => {
    const [x, y] = tileKey.split(",").map(Number);
    const constructionCheck = window.inspectV39Construction("教会", { x, y });
    const confirmations = [];
    const getVillage = () => {
      const state = window.getV39GameState();
      return state.players.find(row => row.id === state.activePlayerId).factionState.settlements.find(row => row.settlementId === "development-a");
    };
    const stockBefore = JSON.stringify(getVillage().materialStockByType);
    window.confirm = message => { confirmations.push(message); return false; };
    const cancelled = window.startV39Construction("兵舎", { x, y });
    const cancelledWithoutChanges = cancelled.cancelled && JSON.stringify(getVillage().materialStockByType) === stockBefore && !getVillage().constructionQueue.length;
    window.confirm = message => { confirmations.push(message); return true; };
    const accepted = window.startV39Construction("兵舎", { x, y });
    const originalEnemyTurn = window.runV39EnemyTurn;
    window.runV39EnemyTurn = async () => {};
    await window.advanceV39Turn();
    await window.advanceV39Turn();
    const completedFacility = getVillage().tileFacilityMap[tileKey]?.includes("兵舎");
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x, y } }));
    await new Promise(resolve => setTimeout(resolve, 80));
    document.getElementById("v39-land-settlement-convert").click();
    await window.advanceV39Turn();
    await window.advanceV39Turn();
    const facilityRemovedAgain = !getVillage().tileFacilityMap[tileKey];
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x, y } }));
    await new Promise(resolve => setTimeout(resolve, 80));
    const button = document.getElementById("v39-land-settlement-convert");
    const buttonText = button.textContent;
    button.click();
    try {
      await window.advanceV39Turn();
      await window.advanceV39Turn();
    } finally {
      window.runV39EnemyTurn = originalEnemyTurn;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    const state = window.getV39GameState();
    const village = state.players.find(row => row.id === state.activePlayerId).factionState.settlements.find(row => row.settlementId === "development-a");
    const scene = window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const structure = scene.children.list.find(child => child.name === "v39-structure-layer");
    const villageMarkerRemaining = structure.list.some(child => child.name === "v39-residential-village-marker" && child.getData("tileKey") === tileKey);
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x:village.x, y:village.y } }));
    await new Promise(resolve => setTimeout(resolve, 80));
    return {
      buttonText,
      cancelledWithoutChanges,
      replacementStarted:accepted.ok,
      replacementCompleted:completedFacility,
      facilityRemovedAgain,
      confirmationMentionsReplacement:confirmations.some(message => message.includes("居住地を兵舎")),
      farmMultiplier:window.getV39FacilityYieldMultiplier(`${village.x},${village.y}`, "穀物", village),
      residentialReplacementAvailable:constructionCheck.available && constructionCheck.replacesResidential,
      completedMode:village.territoryTileModeMap[tileKey],
      villageMarkerRemaining,
      occupiedReversalBlocked:document.getElementById("v39-land-settlement-convert").disabled
    };
  }, report.conversion.tileKey);
  await page.evaluate(async tileKey => {
    const state = window.getV39GameState();
    window.setV39GameState({ players:state.players.map(player => ({
      ...player, factionState:{ ...player.factionState, settlements:player.factionState.settlements.map(village => village.settlementId !== "development-a" ? village : ({
        ...village, constructionQueue:[], territoryTileConversionMap:{ [tileKey]:{ targetMode:"settlement", remainingTurns:2, totalTurns:2, startedTurn:state.timeline.turnNumber } }
      })) }
    })) });
    await new Promise(resolve => setTimeout(resolve, 150));
    const scene = window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const marker = scene.children.list.find(child => child.name === "v39-structure-layer").list.find(child => child.name === "v39-tile-conversion-marker" && child.getData("tileKey") === tileKey);
    scene.cameras.main.centerOn(marker.x, marker.y).setZoom(1.8);
  }, report.conversion.tileKey);
  await page.screenshot({ path:"output/web-game/v39-construction-turn-label.png" });
  console.log(JSON.stringify({ report, errors }, null, 2));

  const firstTurnValid = report.afterOneTurn.length === 2
    && report.afterOneTurn.every(row => row.scaleKey === "village" && row.remainingTurns === 1);
  const completionValid = report.completed.length === 2
    && report.completed.every(row => row.scaleKey === "town" && row.scaleLevel === 2 && row.type === "町" && !row.hasProject);
  const residentialValid = [report.firstResidential, report.secondResidential]
    .every(row => row.center === "town" && row.attached === "town" && typeof row.owner === "string" && row.owner.includes(","));
  const worldSettlementValid = report.worldSettlement.scaleKey === "town"
    && report.worldSettlement.scaleLevel === 2
    && report.worldSettlement.type === "町"
    && report.worldSettlement.occupiedCount === 2
    && report.worldSettlement.markerTextureKey.includes("町")
    && report.worldSettlement.markerWidth > 100
    && report.worldSettlement.markerWidth > report.worldSettlement.markerHeight;
  const uiValid = report.ui.hasButton
    && report.ui.buttonText === "拠点発展"
    && report.ui.modalVisible
    && report.ui.modalTitle === "都市・建設"
    && report.ui.modalText.includes("拠点発展");
  const startValid = report.started.buttonEnabled
    && report.started.selectionBeforeCount === 1
    && report.started.selectionAfterCount === 2
    && report.started.selectionCandidateCount >= 2
    && report.started.selectedTerrain === "海"
    && report.started.renderedSelectionCount === 2
    && report.started.targetScaleKey === "town"
    && report.started.totalTurns === 7
    && report.started.baseBuildTurns === 8
    && report.started.reusedResidentialTileCount === 1
    && report.started.turnReduction === 1
    && report.started.wood < 1000;
  const occupiedFacilityValid = report.occupiedFacilityCheck.available === false
    && report.occupiedFacilityCheck.reasons.includes("このマスには既に施設があります");
  const conversionValid = report.conversion.hasButton
    && report.conversion.buttonEnabled
    && report.conversion.startedRemaining === 2
    && report.conversion.startedMarkerLabel === "居"
    && report.conversion.turnFontSize >= 18
    && report.conversion.turnLabel === "🔨2T"
    && report.conversion.turnAboveCenter
    && report.conversion.previewAlpha === 0.5
    && report.conversion.townCapacity === 130
    && report.conversion.resourceCapacity === 145
    && report.conversion.settlementCapacity === 145
    && report.conversion.renderedResidentialTiles === 5
    && report.conversion.facilityMarkerLabel === "農"
    && report.conversion.facilityMarkerIconFrame === "facility:農場"
    && report.conversion.facilityMarkerTextureKey.includes("v39-facility-icon-sheet:1")
    && report.conversion.facilityMarkerDisplaySize >= 50
    && report.conversion.residentialVillageTextureKey.includes("v39-settlement:村")
    && report.conversion.residentialVillageDisplaySize >= 50
    && report.conversion.facilityRemoved
    && report.conversion.cancelledWithoutChanges
    && report.conversion.confirmationMentionsRemoval
    && report.conversion.constructionRemoved
    && report.conversion.constructionBlockedDuringConversion
    && report.conversion.completedMode === "settlement"
    && !report.conversion.hasQueue;
  const reversalValid = report.reversal.buttonText === "居住化解除" && report.reversal.residentialReplacementAvailable && report.reversal.cancelledWithoutChanges && report.reversal.replacementStarted && report.reversal.replacementCompleted && report.reversal.facilityRemovedAgain && report.reversal.confirmationMentionsReplacement && report.reversal.farmMultiplier === 2 && report.reversal.completedMode === "resource" && !report.reversal.villageMarkerRemaining && report.reversal.occupiedReversalBlocked;
  if (errors.length || !firstTurnValid || !completionValid || !residentialValid || !worldSettlementValid || !startValid || !occupiedFacilityValid || !uiValid || !conversionValid || !reversalValid || report.completionCount !== 2 || report.turnNumber !== 3) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
