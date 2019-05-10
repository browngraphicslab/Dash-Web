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

    export const Caption = new Template("Caption", TemplatePosition.OutterBottom,
        `<div id="screenSpace" style="top: 100%; font-size:14px; background:yellow; width:100%; position:absolute"><FormattedTextBox {...props} fieldKey={"caption"} /></div>`
    );
    export const TitleOverlay = new Template("TitleOverlay", TemplatePosition.InnerTop,
        `<div><div style="height:100%; width:100%;position:absolute;">{layout}</div>
        <div style="height:25px; width:100%; position:absolute; top: 0; background-color: rgba(0, 0, 0, .4); color: white; ">
        <span style="text-align:center;width:100%;font-size:20px;position:absolute;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{props.Document.title}</span>
        </div></div>`
    );
    export const Title = new Template("Title", TemplatePosition.InnerTop,
        `<div><div style="height:calc(100% - 25px); margin-top: 25px; width:100%;position:absolute;">{layout}</div>
        <div style="height:25px; width:100%; position:absolute; top: 0; background-color: rgba(0, 0, 0, .4); color: white; ">
            <span style="text-align:center;width:100%;font-size:20px;position:absolute;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{props.Document.title}</span>
        </div></div>`
    );

    export const Bullet = new Template("Bullet", TemplatePosition.InnerTop,
        `<div><div style="height:100%; width:100%;position:absolute;">{layout}</div>
        <div id="isBullet" style="height:15px; width:15px; margin-left:-16px; pointer-events:all; position:absolute; top: 0; background-color: rgba(0, 0, 0, .4); color: white;">
        <img  id="isBullet"  src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOEAAADhCAMAAAAJbSJIAAAAZlBMVEX///8AAABmZmb7+/tYWFhgYGBFRUVSUlL4+Pg/Pz9jY2N5eXmcnJyioqKBgYFzc3NtbW1LS0s3NzfW1taWlpaOjo6IiIgvLy9WVlampqZcXFw5OTlvb28mJiYxMTHe3t7l5eUjIyMY8kIZAAAD2UlEQVR4nO2d61biMBRGW1FBEVHxfp15/5ecOVa5lHxtArmck/Xtn1BotjtNoXQtm4YQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEFIrX6UHEA1gsmrneceRjHm7cj28attKFOf/TRyKIliH4vzbZE+xE2zbZYkxRWX5Y9JT/BW0X3G+NtlR3Ahar7jcMtlS3Ba0XXG+Y7JW3BW0XHHZM/lR7AvaVewL/ijuC1pV3Bf8VnQJ2lR0CYriq/Nxg4puwfa1aZ7dz9yUHnEgN26NZ3luWkPFd7fEtHsWVDwpO+YgTgYKCuYn6tAU7TBecaygcGpZEQie7m5luKJPQQFUvCwx5iAuvQoK4KShvSIoOHVtCz7dnOUecxBn7kG/urc2eCz6T9EOcxXDCgpAUetyAwoOCBqrGF5QMKR4mCA8L+pTBIJwkRl95eifJjPHTDYTFQ8vePyrs3BsBfXLzfFHkvKKMY4j1ctNnCmmuGKslfCQT0RZiPdFVmnFmOcy36sDWYn7DU9hxdifRkKuEGQh/pWW0K/QiUlxtUxVxTTXyhQtN6kuI6mpmO5qpxJFIBjl1yMVimmvV4PfrnIq3iYsKICTRj7F9L84gIq38fYwCCj4HnMfRY/FPL8ZFayYo6BQbLlJeZrYpVDFXAUFcMtKWkUgmOhmnwKKOQsK4NaxdIp5CwqZj8X8gv27jNecJ9nZuXtnie/SzjhRQcHkt6Fnq1imoAAUY1csVVDIUrFcQSGDIhC8jriLQZIrli0oXKdVLF1QSFqxfEEBVLyI8NYXCgoKySaqhinakajimxrBRBX1FBQSVNRyDP4SXVGbYHRFfYJN8xhTESwyj5HHHEjEihoLCqDiXfAb3aksKESqCAoqEIxUUW9BAS03E+93mOhcZDYcXVF3QeHBPcI3v4qo4EPiUQcBKr75vHaiv6AAKt6NV0SCqgoKqOKYovpFZgOo+DmsOHkyUlA4ZKKamaIdQPEJK5oqKKCKM7D9zFZBIayiuYICWm5cFWef7o3vs486CP8VdQIEVRcU7sFE7VecgSmqvKDgVxEJqi8ogIof2xVnH2YLCuMT1fAU7RirOPtrXHCsovmCwlDFCgoKWNH4IrMBTdQ/NUzRjiu3CeCq9HAPAVSspaDgX9FkQcG3ollB34qGBf0UTQv6KBoXHFc0LzimWIFg0ywGBBelBxcHXLGKggKqWElBwV2xIkF3xaoEXYqVCe4rVifYV3wpPZwULOouKLzUXVBY1F1QeKm7oLCoXVAqVi7YNM7/F0YIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCG+/ANh4i1CHdc63QAAAABJRU5ErkJggg==" 
         width="15px" height="15px"/>
         </div>
        </div>`
    );

    export const TemplateList: Template[] = [Title, TitleOverlay, Caption, Bullet];

    export function sortTemplates(a: Template, b: Template) {
        if (a.Position < b.Position) { return -1; }
        if (a.Position > b.Position) { return 1; }
        return 0;
    }

}

