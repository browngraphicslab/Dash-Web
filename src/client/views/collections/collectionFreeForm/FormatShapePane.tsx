import React = require("react");
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, Field, Opt } from "../../../../fields/Doc";
import { Document } from "../../../../fields/documentSchemas";
import { InkField } from "../../../../fields/InkField";
import { BoolCast, Cast, NumCast } from "../../../../fields/Types";
import { DocumentType } from "../../../documents/DocumentTypes";
import { SelectionManager } from "../../../util/SelectionManager";
import AntimodeMenu from "../../AntimodeMenu";
import "./FormatShapePane.scss";
import { undoBatch } from "../../../util/UndoManager";

@observer
export default class FormatShapePane extends AntimodeMenu {
    static Instance: FormatShapePane;

    private _lastFill = "#D0021B";
    private _lastLine = "#D0021B";
    private _lastDash = "2";
    private _palette = ["#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321", "#417505", "#9013FE", "#4A90E2", "#50E3C2", "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF"];
    private _mode = ["fill-drip", "ruler-combined"];

    @observable private _subOpen = [false, false, false, false];
    @observable private _currMode = "fill-drip";
    @observable private _lock = false;
    @observable private _fillBtn = false;
    @observable private _lineBtn = false;
    @observable _controlBtn = false;
    @observable private _controlPoints: { X: number, Y: number }[] = [];
    @observable _currPoint = -1;

    getField(key: string) {
        return this.selectedInk?.reduce((p, i) =>
            (p === undefined || (p && p === i.rootDoc[key])) && i.rootDoc[key] !== "0" ? Field.toString(i.rootDoc[key] as Field) : "", undefined as Opt<string>)
    }

    @computed get selectedInk() {
        const inks = SelectionManager.SelectedDocuments().filter(i => Document(i.rootDoc).type === DocumentType.INK);
        return inks.length ? inks : undefined;
    }
    @computed get unFilled() { return this.selectedInk?.reduce((p, i) => p && !i.rootDoc.fillColor ? true : false, true) || false; }
    @computed get unStrokd() { return this.selectedInk?.reduce((p, i) => p && !i.rootDoc.color ? true : false, true) || false; }
    @computed get solidFil() { return this.selectedInk?.reduce((p, i) => p && i.rootDoc.fillColor ? true : false, true) || false; }
    @computed get solidStk() { return this.selectedInk?.reduce((p, i) => p && i.rootDoc.color && (!i.rootDoc.strokeDash || i.rootDoc.strokeDash === "0") ? true : false, true) || false; }
    @computed get dashdStk() { return !this.unStrokd && this.getField("strokeDash") || ""; }
    @computed get colorFil() { const ccol = this.getField("fillColor") || ""; ccol && (this._lastFill = ccol); return ccol; }
    @computed get colorStk() { const ccol = this.getField("color") || ""; ccol && (this._lastLine = ccol); return ccol; }
    @computed get widthStk() { return this.getField("strokeWidth") || "1"; }
    @computed get markHead() { return this.getField("strokeStartMarker") || ""; }
    @computed get markTail() { return this.getField("strokeEndMarker") || ""; }
    @computed get shapeHgt() { return this.getField("_height"); }
    @computed get shapeWid() { return this.getField("_width"); }
    @computed get shapeXps() { return this.getField("x"); }
    @computed get shapeYps() { return this.getField("y"); }
    @computed get shapeRot() { return this.getField("rotation"); }
    set unFilled(value) { this.colorFil = value ? "" : this._lastFill; }
    set solidFil(value) { this.unFilled = !value; }
    set colorFil(value) { value && (this._lastFill = value); this.selectedInk?.forEach(i => i.rootDoc.fillColor = value ? value : undefined); }
    set colorStk(value) { value && (this._lastLine = value); this.selectedInk?.forEach(i => i.rootDoc.color = value ? value : undefined); }
    set markHead(value) { this.selectedInk?.forEach(i => i.rootDoc.strokeStartMarker = value); }
    set markTail(value) { this.selectedInk?.forEach(i => i.rootDoc.strokeEndMarker = value); }
    set unStrokd(value) { this.colorStk = value ? "" : this._lastLine; }
    set solidStk(value) { this.dashdStk = ""; this.unStrokd = !value; }
    set dashdStk(value) {
        value && (this._lastDash = value) && (this.unStrokd = false);
        this.selectedInk?.forEach(i => i.rootDoc.strokeDash = value ? this._lastDash : undefined);
    }
    set shapeXps(value) { this.selectedInk?.forEach(i => i.rootDoc.x = Number(value)); }
    set shapeYps(value) { this.selectedInk?.forEach(i => i.rootDoc.y = Number(value)); }
    set shapeRot(value) { this.selectedInk?.forEach(i => i.rootDoc.rotation = Number(value)); }
    set widthStk(value) { this.selectedInk?.forEach(i => i.rootDoc.strokeWidth = Number(value)); }
    set shapeWid(value) {
        this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
            const oldWidth = NumCast(i.rootDoc._width);
            i.rootDoc._width = Number(value);
            this._lock && (i.rootDoc._height = (i.rootDoc._width * NumCast(i.rootDoc._height)) / oldWidth);
        });
    }
    set shapeHgt(value) {
        this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
            const oldHeight = NumCast(i.rootDoc._height);
            i.rootDoc._height = Number(value);
            this._lock && (i.rootDoc._width = (i.rootDoc._height * NumCast(i.rootDoc._width)) / oldHeight);
        });
    }

    constructor(props: Readonly<{}>) {
        super(props);
        FormatShapePane.Instance = this;
        this._canFade = false;
        this.Pinned = BoolCast(Doc.UserDoc()["menuFormatShape-pinned"]);
    }

    @action
    closePane = () => {
        this.fadeOut(false);
        this.Pinned = false;
    }

    @action
    upDownButtons = (dirs: string, field: string) => {
        switch (field) {
            case "rot": this.rotate((dirs === "up" ? .1 : -.1)); break;
            case "Xps": this.selectedInk?.forEach(i => i.rootDoc.x = NumCast(i.rootDoc.x) + (dirs === "up" ? 10 : -10)); break;
            case "Yps": this.selectedInk?.forEach(i => i.rootDoc.y = NumCast(i.rootDoc.y) + (dirs === "up" ? 10 : -10)); break;
            case "stk": this.selectedInk?.forEach(i => i.rootDoc.strokeWidth = NumCast(i.rootDoc.strokeWidth) + (dirs === "up" ? .1 : -.1)); break;
            case "wid": this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
                const oldWidth = NumCast(i.rootDoc._width);
                i.rootDoc._width = oldWidth + (dirs === "up" ? 10 : - 10);
                this._lock && (i.rootDoc._height = (i.rootDoc._width / oldWidth * NumCast(i.rootDoc._height)));
            });
                break;
            case "hgt": this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
                const oldHeight = NumCast(i.rootDoc._height);
                i.rootDoc._height = oldHeight + (dirs === "up" ? 10 : - 10);
                this._lock && (i.rootDoc._width = (i.rootDoc._height / oldHeight * NumCast(i.rootDoc._width)));
            });
                break;
        }
    }

    @undoBatch
    @action
    rotate = (degrees: number) => {
        this.selectedInk?.forEach(action(inkView => {
            const doc = Document(inkView.rootDoc);
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
                    doc._height = (bottom2 - top2) * inkView.props.ScreenToLocalTransform().Scale;
                    doc._width = (right2 - left2) * inkView.props.ScreenToLocalTransform().Scale;
                }
            }
        }));
    }

    @undoBatch
    @action
    control = (xDiff: number, yDiff: number, controlNum: number) => {
        this.selectedInk?.forEach(action(inkView => {
            if (this.selectedInk?.length === 1) {
                const doc = Document(inkView.rootDoc);
                if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                    const ink = Cast(doc.data, InkField)?.inkData;
                    if (ink) {

                        const newPoints: { X: number, Y: number }[] = [];
                        const order = controlNum % 4;
                        for (var i = 0; i < ink.length; i++) {
                            if (controlNum === i ||
                                (order === 0 && i === controlNum + 1) ||
                                (order === 0 && controlNum !== 0 && i === controlNum - 2) ||
                                (order === 0 && controlNum !== 0 && i === controlNum - 1) ||
                                (order === 3 && i === controlNum - 1) ||
                                (order === 3 && controlNum !== ink.length - 1 && i === controlNum + 1) ||
                                (order === 3 && controlNum !== ink.length - 1 && i === controlNum + 2)) {
                                newPoints.push({ X: ink[i].X - (xDiff), Y: ink[i].Y - (yDiff) });
                            }
                            else {
                                newPoints.push({ X: ink[i].X, Y: ink[i].Y });
                            }
                        }
                        const oldx = doc.x;
                        const oldy = doc.y;
                        doc.data = new InkField(newPoints);
                        const xs2 = newPoints.map(p => p.X);
                        const ys2 = newPoints.map(p => p.Y);
                        const left2 = Math.min(...xs2);
                        const top2 = Math.min(...ys2);
                        const right2 = Math.max(...xs2);
                        const bottom2 = Math.max(...ys2);
                        doc._height = (bottom2 - top2) * inkView.props.ScreenToLocalTransform().Scale;
                        doc._width = (right2 - left2) * inkView.props.ScreenToLocalTransform().Scale;
                        doc.x = oldx;
                        doc.y = oldy;
                    }
                }
            }
        }));
    }


    colorPicker(setter: (color: string) => {}) {
        return <div className="btn-group-palette" key="colorpicker" >
            {this._palette.map(color =>
                <button className="antimodeMenu-button" key={color} onPointerDown={undoBatch(action(() => setter(color)))} style={{ zIndex: 1001, position: "relative" }}>
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
            <button className="antiMenu-Buttonup" key="up" onPointerDown={undoBatch(action(() => this.upDownButtons("up", key)))}>
                ˄
            </button>
            <br />
            <button className="antiMenu-Buttonup" key="down" onPointerDown={undoBatch(action(() => this.upDownButtons("down", key)))} style={{ marginTop: -8 }}>
                ˅
            </button>
        </>;
    }

    colorButton(value: string, setter: () => {}) {
        return <>
            <button className="antimodeMenu-button" key="fill" onPointerDown={undoBatch(action(e => setter()))} style={{ position: "absolute", right: 80 }}>
                <FontAwesomeIcon icon="fill-drip" size="lg" />
                <div className="color-previewI" style={{ backgroundColor: value ?? "121212" }} />
            </button>
            <br /> <br />
        </>;
    }

    controlPointsButton() {
        return <>
            <button className="antimodeMenu-button" key="fill" onPointerDown={action(() => this._controlBtn = this._controlBtn ? false : true)} style={{ position: "absolute", right: 80, backgroundColor: this._controlBtn ? "black" : "" }}>
                <FontAwesomeIcon icon="bezier-curve" size="lg" />
            </button>
            <br /> <br />
        </>;
    }
    @computed get fillButton() { return this.colorButton(this.colorFil, () => this._fillBtn = !this._fillBtn); }
    @computed get lineButton() { return this.colorButton(this.colorStk, () => this._lineBtn = !this._lineBtn); }

    @computed get fillPicker() { return this.colorPicker((color: string) => this.colorFil = color); }
    @computed get linePicker() { return this.colorPicker((color: string) => this.colorStk = color); }

    @computed get stkInput() { return this.inputBox("stk", this.widthStk, (val: string) => this.widthStk = val); }
    @computed get hgtInput() { return this.inputBox("hgt", this.shapeHgt, (val: string) => this.shapeHgt = val); }
    @computed get widInput() { return this.inputBox("wid", this.shapeWid, (val: string) => this.shapeWid = val); }
    @computed get rotInput() { return this.inputBox("rot", this.shapeRot, (val: string) => this.shapeRot = val); }
    @computed get XpsInput() { return this.inputBox("Xps", this.shapeXps, (val: string) => this.shapeXps = val); }
    @computed get YpsInput() { return this.inputBox("Yps", this.shapeYps, (val: string) => this.shapeYps = val); }

    @computed get controlPoints() { return this.controlPointsButton(); }

    @computed get propertyGroupItems() {
        const fillCheck = <div key="fill" style={{ display: this._subOpen[0] ? "" : "none", width: "inherit", backgroundColor: "#323232", color: "white", }}>
            <input className="formatShapePane-inputBtn" type="radio" checked={this.unFilled} onChange={undoBatch(action(() => this.unFilled = true))} />
                No Fill
            <br />
            <input className="formatShapePane-inputBtn" type="radio" checked={this.solidFil} onChange={undoBatch(action(() => this.solidFil = true))} />
                Solid Fill
            <br /> <br />
            {this.solidFil ? "Color" : ""}
            {this.solidFil ? this.fillButton : ""}
            {this._fillBtn && this.solidFil ? this.fillPicker : ""}
        </div>;

        const markers = <>
            <input key="markHead" className="formatShapePane-inputBtn" type="checkbox" checked={this.markHead !== ""} onChange={undoBatch(action(() => this.markHead = this.markHead ? "" : "arrow"))} />
                Arrow Head
            <br />
            <input key="markTail" className="formatShapePane-inputBtn" type="checkbox" checked={this.markTail !== ""} onChange={undoBatch(action(() => this.markTail = this.markTail ? "" : "arrow"))} />
                Arrow End
            <br />
        </>;

        const lineCheck = <div key="lineCheck" style={{ display: this._subOpen[1] ? "" : "none", width: "inherit", backgroundColor: "#323232", color: "white", }}>
            <input className="formatShapePane-inputBtn" type="radio" checked={this.unStrokd} onChange={undoBatch(action(() => this.unStrokd = true))} />
                No Line
            <br />
            <input className="formatShapePane-inputBtn" type="radio" checked={this.solidStk} onChange={undoBatch(action(() => this.solidStk = true))} />
                Solid Line
            <br />
            <input className="formatShapePane-inputBtn" type="radio" checked={this.dashdStk ? true : false} onChange={undoBatch(action(() => this.dashdStk = "2"))} />
                Dash Line
            <br />
            <br />
            {(this.solidStk || this.dashdStk) ? "Color" : ""}
            {(this.solidStk || this.dashdStk) ? this.lineButton : ""}
            {(this.solidStk || this.dashdStk) && this._lineBtn ? this.linePicker : ""}
            <br />
            {(this.solidStk || this.dashdStk) ? "Width" : ""}
            {(this.solidStk || this.dashdStk) ? this.stkInput : ""}
            {(this.solidStk || this.dashdStk) ? <input type="range" defaultValue={Number(this.widthStk)} min={1} max={100} onChange={e => this.widthStk = e.target.value} /> : (null)}
            <br /> <br />
            {(this.solidStk || this.dashdStk) ? markers : ""}
        </div>;

        const sizeCheck = <div key="sizeCheck" style={{ display: this._subOpen[2] ? "" : "none", width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Height {this.hgtInput}
            <br /> <br />
                Width {this.widInput}
            <br /> <br />
            <input className="formatShapePane-inputBtn" style={{ right: 0 }} type="checkbox" checked={this._lock} onChange={undoBatch(action(() => this._lock = !this._lock))} />
                Lock Ratio
            <br />  <br />
                Rotation {this.rotInput}
            <br /> <br />
                Edit Points {this.controlPoints}
        </div>;

        const positionCheck = <div key="posCheck" style={{ display: this._subOpen[3] ? "" : "none", width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Horizontal {this.XpsInput}
            <br /> <br />
            Vertical {this.YpsInput}
            <br /> <br />
        </div>;

        const subMenus = this._currMode === "fill-drip" ? [`fill`, `line`] : [`size`, `position`];
        const menuItems = this._currMode === "fill-drip" ? [fillCheck, lineCheck] : [sizeCheck, positionCheck];
        const indexOffset = this._currMode === "fill-drip" ? 0 : 2;
        return <div className="antimodeMenu-sub" key="submenu" style={{ position: "absolute", width: "inherit", top: 60 }}>
            {subMenus.map((subMenu, i) =>
                <div key={subMenu} style={{ width: "inherit" }}>
                    <button className="antimodeMenu-button" onPointerDown={action(() => this._subOpen[i + indexOffset] = !this._subOpen[i + indexOffset])}
                        style={{ backgroundColor: "121212", position: "relative", width: "inherit" }}>
                        {this._subOpen[i + indexOffset] ? "▼" : "▶︎"}
                        {subMenu}
                    </button>
                    {menuItems[i]}
                </div>)}
        </div>;
    }

    @computed get closeBtn() {
        return <button className="antimodeMenu-button" key="close" onPointerDown={action(() => this.closePane())} style={{ position: "absolute", right: 0 }}>
            X
        </button>;
    }

    @computed get propertyGroupBtn() {
        return <div className="antimodeMenu-button-tab" key="modes">
            {this._mode.map(mode =>
                <button className="antimodeMenu-button" key={mode} onPointerDown={action(() => this._currMode = mode)}
                    style={{ backgroundColor: this._currMode === mode ? "121212" : "", position: "relative", top: 30 }}>
                    <FontAwesomeIcon icon={mode as IconProp} size="lg" />
                </button>)}
        </div>;
    }

    render() {
        return this.getElementVert([this.closeBtn, this.propertyGroupBtn, this.propertyGroupItems]);
    }
}