import React = require("react");

export enum TemplatePosition {
    InnerTop,
    InnerBottom,
    InnerRight,
    InnerLeft,
    TopRight,
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

    export const Caption = new Template("Caption", TemplatePosition.OutterBottom,
        `<div>
            <div style="height:100%; width:100%;">{layout}</div>
            <div style="bottom: 0; font-size:14px; width:100%; position:absolute">
                <FormattedTextBox {...props} fieldKey={"caption"} hideOnLeave={"true"} />
            </div>
        </div>` );

    export const Title = new Template("Title", TemplatePosition.InnerTop,
        `<div>
            <div style="height:25px; width:100%; background-color: rgba(0, 0, 0, .4); color: white; z-index: 100">
                <span style="text-align:center;width:100%;font-size:20px;position:absolute;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{props.Document.title}</span>
            </div>
            <div style="height:calc(100% - 25px);">
                <div style="width:100%;overflow:auto">{layout}</div>
            </div>
        </div>` );
    export const TitleHover = new Template("TitleHover", TemplatePosition.InnerTop,
        `<div>
            <div style="height:25px; width:100%; background-color: rgba(0, 0, 0, .4); color: white; z-index: 100">
                <span style="text-align:center;width:100%;font-size:20px;position:absolute;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{props.Document.title}</span>
            </div>
            <div style="height:calc(100% - 25px);">
                <div style="width:100%;overflow:auto">{layout}</div>
            </div>
        </div>` );

    export const TemplateList: Template[] = [Title, TitleHover, Caption];

    export function sortTemplates(a: Template, b: Template) {
        if (a.Position < b.Position) { return -1; }
        if (a.Position > b.Position) { return 1; }
        return 0;
    }

}

