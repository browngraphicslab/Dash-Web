export interface I_globalScss {
    contextMenuZindex: number;  // context menu shows up over everything
    mainTextInputZindex: number; // then text input overlay so that it's context menu will appear over decorations, etc
    docDecorationsZindex: number; // then doc decorations appear over everything else
    remoteCursorsZindex: number; // ... not sure what level the remote cursors should go -- is this right?
}

export const globalStyles: I_globalScss;

export default globalStyles;