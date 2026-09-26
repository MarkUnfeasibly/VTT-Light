export const state = {
    walls: [],
    lights: {},
    lightMarkers: {},
    tokens: {},
    tokenSprites: {},
    tokenSettings: { count: 6, radius: 250 },

    isMovementLocked: false,
    
    isDrawMode: false,
    isDrawing: false,
    startPoint: null,
    
    isLightAddMode: false,
    activeDragLightId: null,
    activeSelectLightId: null,
    activeDragTokenId: null,
    
    activeSelectWallIndex: null,
    activeDragWallNode: null,

    currentMapSprite: null,
    currentMapUrl: null,

    isPanning: false,
    panStart: null,
    isSpacePressed: false
};