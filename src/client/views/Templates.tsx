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
    export const Caption = new Template("Caption",
        `<div>
            <div style="height:100%; width:100%;">{layout}</div>
            <div style="bottom: 0; font-size:14px; width:100%; position:absolute">
                <FormattedTextBox {...props} fieldKey={"caption"} hideOnLeave={"true"} />
            </div>
        </div>` );

    export const Title = new Template("Title",
        `<div>
            <div style="height:25px; width:100%; background-color: rgba(0, 0, 0, .4); color: white; z-index: 100">
                <span style="text-align:center;width:100%;font-size:20px;position:absolute;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{props.Document.title}</span>
            </div>
            <div style="height:calc(100% - 25px);">
                <div style="width:100%;overflow:auto">{layout}</div>
            </div>
        </div>` );
    export const TitleHover = new Template("TitleHover", Title.Layout);

    export const TemplateList: Template[] = [Title, TitleHover, Caption];
}

