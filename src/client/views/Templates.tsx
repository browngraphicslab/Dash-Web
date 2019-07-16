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
                <FormattedTextBox {...props} height="min-content" fieldKey={"caption"} hideOnLeave={"true"} />
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

    export const Header = new Template("Header", TemplatePosition.InnerTop,
        `<div style = "display:flex; flex-direction:column; height:100%;" >
            <div style="width:100%; background-color: rgba(0, 0, 0, .4); color: white; ">
                <FormattedTextBox {...props} height={"min-content"} color={"white"} fieldKey={"header"} />
            </div>
            <div style="width:100%;height:100%;overflow:auto;">{layout}</div>
        </div > ` );

    export const Bullet = new Template("Bullet", TemplatePosition.InnerTop,
        `< div >
        <div style="height:100%; width:100%;position:absolute;">{layout}</div>
        <div id="isExpander" style="height:15px; width:15px; margin-left:-16px; pointer-events:all; position:absolute; top: 0; background-color: rgba(0, 0, 0, .4); color: white;">
            <img id="isExpander" src="/assets/downarrow.png" width="15px" height="15px" />
        </div>
        </div > `
    );

    export function ImageOverlay(width: number, height: number, field: string = "thumbnail") {
        return (`< div >
        <div style="height:100%; width:100%; position:absolute;">{layout}</div>
        <div style="height:auto; width:${width}px; bottom:0; right:0; background:rgba(0,0,0,0.25); position:absolute;overflow:hidden;">
            <ImageBox id="isExpander" {...props} style="width:100%; height=auto;" PanelWidth={${width}} fieldKey={"${field}"} />
                </div>
            </div > `);
    }

    export function TitleBar(datastring: string) {
        return (`<div>
            <div style="height:25px; width:100%; background-color: rgba(0, 0, 0, .4); color: white; z-index: 100">
                <span style="text-align:center;width:100%;font-size:20px;position:absolute;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${datastring}</span>
            </div>
            <div style="height:calc(100% - 25px);">
                <div style="width:100%;overflow:auto">{layout}</div>
            </div>
        </div>` );
    }
    export const TemplateList: Template[] = [Title, Header, Caption, Bullet];

    export function sortTemplates(a: Template, b: Template) {
        if (a.Position < b.Position) { return -1; }
        if (a.Position > b.Position) { return 1; }
        return 0;
    }

}

