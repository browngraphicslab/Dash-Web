import * as globalStyleVariables from "../views/globalCssVariables.scss"

export interface I_globalScss {
    contextMenuZindex: string;  // context menu shows up over everything
}
let globalStyles = globalStyleVariables as any as I_globalScss;

export default globalStyles;