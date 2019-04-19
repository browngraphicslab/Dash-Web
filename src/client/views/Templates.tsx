import { observer } from "mobx-react";
import { observable } from "mobx";
import { action, computed } from "mobx";
import React = require("react");
import { StringLiteral } from "babel-types";

export class Template {
    constructor(name: string, layout: string) {
        this._name = name;
        this._layout = layout;
    }

    private _name: string;
    private _layout: string;

    get Name(): string {
        return this._name;
    }

    get Layout(): string {
        return this._layout;
    }

}

export namespace Templates {
    export const OuterCaption = new Template("Outer caption",
        `
    <div>
        <div style="margin:auto; height:calc(100%); width:100%;">
            {layout}
        </div>
        <div style="height:(100% + 25px); width:100%; position:absolute">
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={CaptionKey} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
        </div>
    </div>       
            `);
    export const InnerCaption = new Template("Inner caption",
        `
    <div>
        <div style="margin:auto; height:calc(100% - 25px); width:100%;">
            {layout}
        </div>
        <div style="height:25px; width:100%; position:absolute">
            <FormattedTextBox doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={CaptionKey} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost}/>
        </div>
    </div>       
            `);

    export const Title = new Template("Title",
        `
    <div>
        <div style="margin:auto; height:calc(100% - 50px); width:100%;">
            {layout}
        </div>
        <div style="height:50px; width:100%; position:absolute">
            {Title}
        </div>
    </div>       
            `);
}

