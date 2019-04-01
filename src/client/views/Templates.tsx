import { observer } from "mobx-react";
import { observable } from "mobx";
import { action, computed } from "mobx";
import React = require("react");

export class Template {
    constructor(layout: string) {
        this._layout = layout;
    }

    private _layout: string = "";

    get Layout(): string {
        return this._layout;
    }
}

export namespace Templates {
    export const OuterCaption = new Template(`
    <div>
        <div style="margin:auto; height:calc(100%); width:100%;">
            {layout}
        </div>
        <div style="height:(100% + 25px); width:100%; position:absolute">
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"CaptionKey"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
        </div>
    </div>       
            `);
    export const InnerCaption = new Template(`
    <div>
        <div style="margin:auto; height:calc(100% - 25px); width:100%;">
            {layout}
        </div>
        <div style="height:25px; width:100%; position:absolute">
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={"CaptionKey"} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
        </div>
    </div>       
            `);
}

