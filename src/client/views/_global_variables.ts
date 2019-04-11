import * as globalStyleVariables from "../views/_global_variables.scss";

export interface IGlobalScss {
    contextMenuZindex: string;  // context menu shows up over everything
}
let globalStyles = globalStyleVariables as any as IGlobalScss;

export default globalStyles;