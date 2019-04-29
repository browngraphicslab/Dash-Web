import React = require("react");

export enum TemplatePosition {
    InnerTop,
    InnerBottom,
    InnerRight,
    InnerLeft,
    OutterTop,
    OutterBottom,
    OutterRight,
    OutterLeft,
}

export class Template {
    constructor(name: string, position: TemplatePosition, layout: string) {
        this._name = name;
        this._position = position;
        this._layout = layout;
    }

    private _name: string;
    private _position: TemplatePosition;
    private _layout: string;

    get Name(): string {
        return this._name;
    }

    get Position(): TemplatePosition {
        return this._position;
    }

    get Layout(): string {
        return this._layout;
    }
}

export namespace Templates {
    // export const BasicLayout = new Template("Basic layout", "{layout}");

    export const OuterCaption = new Template("Outer caption", TemplatePosition.OutterBottom,
        `<div><div style="margin:auto; height:calc(100%); width:100%;">{layout}</div><div style="height:(100% + 50px); width:100%; position:absolute"><FormattedTextBox {...props} fieldKey={CaptionKey} /></div></div>`
    );

    export const InnerCaption = new Template("Inner caption", TemplatePosition.InnerBottom,
        `<div><div style="margin:auto; height:calc(100% - 50px); width:100%;">{layout}</div><div style="height:50px; width:100%; position:absolute"><FormattedTextBox {...props} fieldKey={CaptionKey}/></div></div>`
    );

    export const SideCaption = new Template("Side caption", TemplatePosition.OutterRight,
        `<div><div style="margin:auto; height:100%; width:100%;">{layout}</div><div style="height:100%; width:300px; position:absolute; top: 0; right: -300px;"><FormattedTextBox {...props} fieldKey={CaptionKey}/></div> </div>`
    );

    export const Title = new Template("Title", TemplatePosition.InnerTop,
        `<div><div style="height:100%; width:100%;position:absolute;">{layout}</div><div style="height:25px; width:100%; position:absolute; top: 0; background-color: rgba(0, 0, 0, .4); color: white; padding:2px 10px">{Title}</div></div>`
    );

    export const TemplateList: Template[] = [Title, OuterCaption, InnerCaption, SideCaption];

    export function sortTemplates(a: Template, b: Template) {
        if (a.Position < b.Position) { return -1; }
        if (a.Position > b.Position) { return 1; }
        return 0;
    }

}

