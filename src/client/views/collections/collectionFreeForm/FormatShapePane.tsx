import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { observable, action, computed } from "mobx";
import "./FormatShapePane.scss";
import { Scripting } from "../../../util/Scripting";
import { InkField } from "../../../../fields/InkField";
import { Doc, Opt, Field } from "../../../../fields/Doc";
import { SelectionManager } from "../../../util/SelectionManager";
import { DocumentView } from "../../../views/nodes/DocumentView";
import { Document } from "../../../../fields/documentSchemas";
import { DocumentType } from "../../../documents/DocumentTypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { Cast, StrCast, BoolCast, NumCast } from "../../../../fields/Types";

@observer
export default class FormatShapePane extends AntimodeMenu {
    static Instance: FormatShapePane;

    private _lastFill = "#D0021B";
    private _lastLine = "#D0021B";
    private _lastDash = "2";
    private _palette = ["#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321", "#417505", "#9013FE", "#4A90E2", "#50E3C2", "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF"];
    private _mode = ["fill-drip", "ruler-combined"];
    private _subMenu = ["fill", "line", "size", "position"];

    @observable private _subOpen = [false, false, false, false];
    @observable private _currMode: string = "fill-drip";
    @observable private _lock = false;
    @observable private _fillBtn = false;
    @observable private _lineBtn = false;

    getField(key: string) {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p && p === i.rootDoc[key])) && i.rootDoc[key] !== "0" ? Field.toString(i.rootDoc[key] as Field) : "", undefined as Opt<string>)
    }

    @computed get inks() {
        const inks = SelectionManager.SelectedDocuments().filter(i => Document(i.rootDoc).type === DocumentType.INK);
        return inks.length ? inks : undefined;
    }
    @computed get _noFill() { return this.inks?.reduce((p, i) => p && !i.rootDoc.fillColor ? true : false, true) || false; }
    @computed get _solidFill() { return this.inks?.reduce((p, i) => p && i.rootDoc.fillColor ? true : false, true) || false; }
    @computed get _noLine() { return this.inks?.reduce((p, i) => p && !i.rootDoc.color ? true : false, true) || false; }
    @computed get _solidLine() { return this.inks?.reduce((p, i) => p && i.rootDoc.color && (!i.rootDoc.dash || i.rootDoc.dash === "0") ? true : false, true) || false; }
    @computed get _arrowStart() { return this.getField("arrowStart") || ""; }
    @computed get _arrowEnd() { return this.getField("arrowEnd") || ""; }
    @computed get _dashLine() { return !this._noLine && this.getField("dash") || ""; }
    @computed get _currSizeHeight() { return this.getField("_height"); }
    @computed get _currSizeWidth() { return this.getField("_width"); }
    @computed get _currRotation() { return this.getField("rotation"); }
    @computed get _currXpos() { return this.getField("x"); }
    @computed get _currYpos() { return this.getField("y"); }
    @computed get _currStrokeWidth() { return this.getField("strokeWidth"); }
    @computed get _currFill() { const cfill = this.getField("fillColor") || ""; cfill && (this._lastFill = cfill); return cfill; }
    @computed get _currColor() { const ccol = this.getField("color") || ""; ccol && (this._lastLine = ccol); return ccol; }
    set _noFill(value) { this._currFill = value ? "" : this._lastFill; }
    set _solidFill(value) { this._noFill = !value; }
    set _currFill(value) { value && (this._lastFill = value); this.inks?.forEach(i => i.rootDoc.fillColor = value ? value : undefined); }
    set _currColor(value) { value && (this._lastLine = value); this.inks?.forEach(i => i.rootDoc.color = value ? value : undefined); }
    set _arrowStart(value) { this.inks?.forEach(i => i.rootDoc.arrowStart = value); }
    set _arrowEnd(value) { this.inks?.forEach(i => i.rootDoc.arrowEnd = value); }
    set _noLine(value) { this._currColor = value ? "" : this._lastLine; }
    set _solidLine(value) { this._dashLine = ""; this._noLine = !value; }
    set _dashLine(value) {
        value && (this._lastDash = value) && (this._noLine = false);
        this.inks?.forEach(i => i.rootDoc.dash = value ? this._lastDash : undefined);
    }
    set _currXpos(value) { this.inks?.forEach(i => i.rootDoc.x = Number(value)); }
    set _currYpos(value) { this.inks?.forEach(i => i.rootDoc.y = Number(value)); }
    set _currRotation(value) { this.inks?.forEach(i => i.rootDoc.rotation = Number(value)); }
    set _currStrokeWidth(value) { this.inks?.forEach(i => i.rootDoc.strokeWidth = Number(value)); }
    set _currSizeWidth(value) {
        this.inks?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
            const oldWidth = NumCast(i.rootDoc._width);
            i.rootDoc._width = Number(value);
            this._lock && (i.rootDoc._height = (i.rootDoc._width * NumCast(i.rootDoc._height)) / oldWidth);
        });
    }
    set _currSizeHeight(value) {
        this.inks?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
            const oldHeight = NumCast(i.rootDoc._height);
            i.rootDoc._height = Number(value);
            this._lock && (i.rootDoc._width = (i.rootDoc._height * NumCast(i.rootDoc._width)) / oldHeight);
        });
    }

    constructor(props: Readonly<{}>) {
        super(props);
        FormatShapePane.Instance = this;
        this._canFade = false;
        this.Pinned = BoolCast(Doc.UserDoc()["formatShapePane-pinned"]);
    }

    @action
    closePane = () => {
        this.jumpTo(-300, -300);
        this.Pinned = false;
    }

    @action
    upDownButtons = (dirs: string, field: string) => {
        switch (field) {
            case "horizontal": this.inks?.forEach(i => i.rootDoc.x = NumCast(i.rootDoc.x) + (dirs === "up" ? 10 : -10)); break;
            case "vertical": this.inks?.forEach(i => i.rootDoc.y = NumCast(i.rootDoc.y) + (dirs === "up" ? 10 : -10)); break;
            case "rotation": this.rotate((dirs === "up" ? .1 : -.1)); break;
            case "width": this.inks?.forEach(i => i.rootDoc.strokeWidth = NumCast(i.rootDoc.strokeWidth) + (dirs === "up" ? .1 : -.1)); break;
            case "sizeWidth":
                this.inks?.forEach(i => {
                    const doc = i.rootDoc;
                    if (doc._width && doc._height) {
                        const oldWidth = NumCast(doc._width);
                        const oldHeight = NumCast(doc._height);
                        doc._width = NumCast(doc._width) + (dirs === "up" ? 10 : - 10);
                        if (this._lock) {
                            doc._height = (NumCast(doc._width) * oldHeight) / oldWidth;
                        }
                    }
                });
                break;
            case "sizeHeight":
                this.inks?.forEach(i => {
                    const doc = i.rootDoc;
                    if (doc._width && doc._height) {
                        const oldWidth = NumCast(doc._width);
                        const oldHeight = NumCast(doc._height);
                        doc._height = NumCast(doc._height) + (dirs === "up" ? 10 : - 10);
                        if (this._lock) {
                            doc._width = (NumCast(doc._height) * oldWidth) / oldHeight;
                        }
                    }
                });
                break;
        }
    }

    @computed get close() {
        return <button className="antimodeMenu-button" key="close" onPointerDown={action(() => this.closePane())} style={{ right: 0 }}>
            X
        </button>;
    }

    //select either coor&fill or size&position
    @computed get modes() {
        return <div className="antimodeMenu-button-tab" key="modes">
            {this._mode.map(mode =>
                <button className="antimodeMenu-button" key={mode} onPointerDown={action(() => { this._currMode = mode; })}
                    style={{ backgroundColor: this._currMode === mode ? "121212" : "", position: "relative", top: 30 }}>
                    <FontAwesomeIcon icon={mode as IconProp} size="lg" />
                </button>)}
        </div>;
    }

    @action
    rotate = (degrees: number) => {
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                const angle = Number(degrees) - Number(doc.rotation);
                doc.rotation = Number(degrees);
                const ink = Cast(doc.data, InkField)?.inkData;
                if (ink) {
                    const xs = ink.map(p => p.X);
                    const ys = ink.map(p => p.Y);
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);
                    const _centerPoints: { X: number, Y: number }[] = [];
                    _centerPoints.push({ X: left, Y: top });

                    const newPoints: { X: number, Y: number }[] = [];
                    for (var i = 0; i < ink.length; i++) {
                        const newX = Math.cos(angle) * (ink[i].X - _centerPoints[0].X) - Math.sin(angle) * (ink[i].Y - _centerPoints[0].Y) + _centerPoints[0].X;
                        const newY = Math.sin(angle) * (ink[i].X - _centerPoints[0].X) + Math.cos(angle) * (ink[i].Y - _centerPoints[0].Y) + _centerPoints[0].Y;
                        newPoints.push({ X: newX, Y: newY });
                    }
                    doc.data = new InkField(newPoints);
                    const xs2 = newPoints.map(p => p.X);
                    const ys2 = newPoints.map(p => p.Y);
                    const left2 = Math.min(...xs2);
                    const top2 = Math.min(...ys2);
                    const right2 = Math.max(...xs2);
                    const bottom2 = Math.max(...ys2);
                    doc._height = (bottom2 - top2) * element.props.ScreenToLocalTransform().Scale;
                    doc._width = (right2 - left2) * element.props.ScreenToLocalTransform().Scale;
                }
            }
        }));
    }

    @computed get subMenu() {
        const fillCheck = <div key="fill" style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            <input id="nofill" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._noFill} onChange={action(() => this._noFill = true)} />
            No Fill
            <br />
            <input id="solidfill" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._solidFill} onChange={action(() => this._solidFill = true)} />
            Solid Fill
            <br />
            <br />
            {this._solidFill ? "Color" : ""}
            {this._solidFill ? this.fillButton : ""}
            {this._fillBtn && this._solidFill ? this.fillPicker : ""}
        </div>;

        const arrows = <>
            <input id="arrowStart" key="arrowstart" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._arrowStart !== ""} onChange={action(() => this._arrowStart = this._arrowStart ? "" : "arrow")} />
            Arrow Head
            <br />
            <input id="arrowEnd" key="arrowend" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._arrowEnd !== ""} onChange={action(() => this._arrowEnd = this._arrowEnd ? "" : "arrow")} />
            Arrow End
            <br />
        </>;

        const lineCheck = <div key="lineCheck" style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            <input id="noLine" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._noLine} onChange={action(() => this._noLine = true)} />
                No Line
            <br />
            <input id="solidLine" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._solidLine} onChange={action(() => this._solidLine = true)} />
                Solid Line
            <br />
            <input id="dashLine" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._dashLine ? true : false} onChange={action(() => this._dashLine = "2")} />
                Dash Line
            <br />
            <br />
            {(this._solidLine || this._dashLine) ? "Color" : ""}
            {(this._solidLine || this._dashLine) ? this.lineButton : ""}
            {this._lineBtn && (this._solidLine || this._dashLine) ? this.linePicker : ""}
            <br />
            {(this._solidLine || this._dashLine) ? "Width" : ""}
            {(this._solidLine || this._dashLine) ? this.widthInput : ""}
            <br />
            <br />
            {(this._solidLine || this._dashLine) ? arrows : ""}
        </div>;

        const sizeCheck = <div key="sizeCheck" style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Height {this.sizeHeightInput}
            <br />
            <br />

            Width {this.sizeWidthInput}
            <br />
            <br />

            <input id="lock" style={{ width: "inherit", position: "absolute", right: 0 }} type="checkbox" checked={this._lock} onChange={action(() => this._lock = !this._lock)} />
                Lock Ratio
            <br />
            <br />

            Rotation {this.rotationInput}
            <br />
            <br />
        </div>;

        const positionCheck = <div key="posCheck" style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Horizontal {this.positionHorizontalInput}
            <br />
            <br />

            Vertical {this.positionVerticalInput}
            <br />
            <br />
        </div>;

        return <div className="antimodeMenu-sub" key="submenu" style={{ position: "absolute", width: "inherit", top: 60 }}>
            {this._subMenu.map((subMenu, i) => {
                if (subMenu === "fill" || subMenu === "line") {
                    return <div key={subMenu} style={{ width: "inherit" }}>
                        <button className="antimodeMenu-button"
                            onPointerDown={action(() => { this._subOpen[i] = this._subOpen[i] ? false : true; })}
                            style={{ backgroundColor: "121212", position: "relative", display: this._currMode === "fill-drip" ? "" : "none", width: "inherit" }}>
                            {this._subOpen[i] ? "▼" : "▶︎"}
                            {subMenu}
                        </button>
                        {this._currMode === "fill-drip" && subMenu === "fill" && this._subOpen[0] ? fillCheck : ""}
                        {this._currMode === "fill-drip" && subMenu === "line" && this._subOpen[1] ? lineCheck : ""}
                    </div>;
                }
                else if (subMenu === "size" || subMenu === "position") {
                    return <div key={subMenu} style={{ width: "inherit" }}>
                        <button className="antimodeMenu-button"
                            onPointerDown={action(() => { this._subOpen[i] = this._subOpen[i] ? false : true; })}
                            style={{ backgroundColor: "121212", position: "relative", display: this._currMode === "ruler-combined" ? "" : "none", width: "inherit" }}>
                            {this._subOpen[i] ? "▼" : "▶︎"}
                            {subMenu}
                        </button>
                        {this._currMode === "ruler-combined" && subMenu === "size" && this._subOpen[2] ? sizeCheck : ""}
                        {this._currMode === "ruler-combined" && subMenu === "position" && this._subOpen[3] ? positionCheck : ""}
                    </div>;
                }
            })}
        </div>;
    }

    colorPicker(setter: (color: string) => {}) {
        return <div className="btn-group-palette" key="colorpicker" >
            {this._palette.map(color =>
                <button className="antimodeMenu-button" key={color} onPointerDown={action(() => setter(color))} style={{ zIndex: 1001, position: "relative" }}>
                    <div className="color-previewII" style={{ backgroundColor: color }} />
                </button>)}
        </div>;
    }
    inputBox = (key: string, value: any, setter: (val: string) => {}) => {
        return <>
            <input style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={value}
                onChange={e => setter(e.target.value)}
                autoFocus />
            <button className="antiMenu-Buttonup" key="up" onPointerDown={action(() => this.upDownButtons("up", key))}>
                ˄
            </button>
            <br />
            <button className="antiMenu-Buttonup" key="down" onPointerDown={action(() => this.upDownButtons("down", key))} style={{ marginTop: -8 }}>
                ˅
            </button>
        </>;
    }

    colorButton(value: string, setter: () => {}) {
        return <>
            <button className="antimodeMenu-button" key="fill" onPointerDown={action(e => setter())} style={{ right: 80 }}>
                <FontAwesomeIcon icon="fill-drip" size="lg" />
                <div className="color-previewI" style={{ backgroundColor: value ?? "121212" }} />
            </button>
            <br></br>
            <br></br>
        </>;
    }

    @computed get fillButton() { return this.colorButton(this._currFill, () => this._fillBtn = !this._fillBtn); }
    @computed get lineButton() { return this.colorButton(this._currColor, () => this._lineBtn = !this._lineBtn); }

    @computed get fillPicker() { return this.colorPicker((color: string) => this._currFill = color); }
    @computed get linePicker() { return this.colorPicker((color: string) => this._currColor = color); }

    @computed get widthInput() { return this.inputBox("width", this._currStrokeWidth, (val: string) => this._currStrokeWidth = val); }
    @computed get sizeHeightInput() { return this.inputBox("height", this._currSizeHeight, (val: string) => this._currSizeHeight = val); }
    @computed get sizeWidthInput() { return this.inputBox("height", this._currSizeWidth, (val: string) => this._currSizeWidth = val); }
    @computed get rotationInput() { return this.inputBox("rotation", this._currRotation, (val: string) => this._currRotation = val); }
    @computed get positionHorizontalInput() { return this.inputBox("horizontal", this._currXpos, (val: string) => this._currXpos = val); }
    @computed get positionVerticalInput() { return this.inputBox("vertical", this._currYpos, (val: string) => this._currYpos = val); }

    render() {
        return this.getElementVert([this.close, this.modes, this.subMenu]);
    }
}
Scripting.addGlobal(function activatePen2(penBtn: any) {
    if (penBtn) {
        //no longer changes to inkmode
        // Doc.SetSelectedTool(InkTool.Pen);
        FormatShapePane.Instance.jumpTo(300, 300);
        FormatShapePane.Instance.Pinned = true;
    } else {
        // Doc.SetSelectedTool(InkTool.None);
        FormatShapePane.Instance.Pinned = false;
        FormatShapePane.Instance.fadeOut(true);
    }
});