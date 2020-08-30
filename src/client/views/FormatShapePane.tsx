import React = require("react");
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { ColorState, SketchPicker } from 'react-color';
import { Doc, Field, Opt } from "../../fields/Doc";
import { Document } from "../../fields/documentSchemas";
import { InkField } from "../../fields/InkField";
import { BoolCast, Cast, NumCast } from "../../fields/Types";
import { DocumentType } from "../documents/DocumentTypes";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import { AntimodeMenu, AntimodeMenuProps } from "./AntimodeMenu";
import "./FormatShapePane.scss";

@observer
export class FormatShapePane extends AntimodeMenu<AntimodeMenuProps> {
    static Instance: FormatShapePane;

    private _lastFill = "#D0021B";
    private _lastLine = "#D0021B";
    private _lastDash = "2";
    private _mode = ["fill-drip", "ruler-combined"];

    @observable private _subOpen = [false, false];
    @observable private _currMode = "fill-drip";
    @observable _lock = false;
    @observable private _fillBtn = false;
    @observable private _lineBtn = false;
    @observable _controlBtn = false;
    @observable private _controlPoints: { X: number, Y: number }[] = [];
    @observable _currPoint = -1;

    getField(key: string) {
        return this.selectedInk?.reduce((p, i) =>
            (p === undefined || (p && p === i.rootDoc[key])) && i.rootDoc[key] !== "0" ? Field.toString(i.rootDoc[key] as Field) : "", undefined as Opt<string>);
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
        runInAction(() => this.Pinned = BoolCast(Doc.UserDoc()["menuFormatShape-pinned"]));
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
            // case "rot": this.selectedInk?.forEach(i => i.rootDoc.rotation = NumCast(i.rootDoc.rotation) + (dirs === "up" ? 0.1 : -0.1)); break;
            case "Xps": this.selectedInk?.forEach(i => i.rootDoc.x = NumCast(i.rootDoc.x) + (dirs === "up" ? 10 : -10)); break;
            case "Yps": this.selectedInk?.forEach(i => i.rootDoc.y = NumCast(i.rootDoc.y) + (dirs === "up" ? 10 : -10)); break;
            case "stk": this.selectedInk?.forEach(i => i.rootDoc.strokeWidth = NumCast(i.rootDoc.strokeWidth) + (dirs === "up" ? .1 : -.1)); break;
            case "wid": this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
                //redraw points
                const oldWidth = NumCast(i.rootDoc._width);
                const oldHeight = NumCast(i.rootDoc._height);
                const oldX = NumCast(i.rootDoc.x);
                const oldY = NumCast(i.rootDoc.y);
                i.rootDoc._width = oldWidth + (dirs === "up" ? 10 : - 10);
                this._lock && (i.rootDoc._height = (i.rootDoc._width / oldWidth * NumCast(i.rootDoc._height)));
                const doc = Document(i.rootDoc);
                if (doc.type === DocumentType.INK && doc.x && doc.y && doc._height && doc._width) {
                    const ink = Cast(doc.data, InkField)?.inkData;
                    if (ink) {
                        const newPoints: { X: number, Y: number }[] = [];
                        ink.forEach(i => {
                            // (new x — oldx) + (oldxpoint * newWidt)/oldWidth 
                            const newX = ((doc.x || 0) - oldX) + (i.X * (doc._width || 0)) / oldWidth;
                            const newY = ((doc.y || 0) - oldY) + (i.Y * (doc._height || 0)) / oldHeight;
                            newPoints.push({ X: newX, Y: newY });
                        });
                        Doc.GetProto(doc).data = new InkField(newPoints);
                    }
                }
            });
                break;
            case "hgt": this.selectedInk?.filter(i => i.rootDoc._width && i.rootDoc._height).forEach(i => {
                const oldWidth = NumCast(i.rootDoc._width);
                const oldHeight = NumCast(i.rootDoc._height);
                const oldX = NumCast(i.rootDoc.x);
                const oldY = NumCast(i.rootDoc.y); i.rootDoc._height = oldHeight + (dirs === "up" ? 10 : - 10);
                this._lock && (i.rootDoc._width = (i.rootDoc._height / oldHeight * NumCast(i.rootDoc._width)));
                const doc = Document(i.rootDoc);
                if (doc.type === DocumentType.INK && doc.x && doc.y && doc._height && doc._width) {
                    const ink = Cast(doc.data, InkField)?.inkData;
                    if (ink) {
                        const newPoints: { X: number, Y: number }[] = [];
                        ink.forEach(i => {
                            // (new x — oldx) + (oldxpoint * newWidt)/oldWidth 
                            const newX = ((doc.x || 0) - oldX) + (i.X * (doc._width || 0)) / oldWidth;
                            const newY = ((doc.y || 0) - oldY) + (i.Y * (doc._height || 0)) / oldHeight;
                            newPoints.push({ X: newX, Y: newY });
                        });
                        Doc.GetProto(doc).data = new InkField(newPoints);
                    }
                }
            });
                break;
        }
    }

    @undoBatch
    @action
    addPoints = (x: number, y: number, pts: { X: number, Y: number }[], index: number, control: { X: number, Y: number }[]) => {
        this.selectedInk?.forEach(action(inkView => {
            if (this.selectedInk?.length === 1) {
                const doc = Document(inkView.rootDoc);
                if (doc.type === DocumentType.INK) {
                    const ink = Cast(doc.data, InkField)?.inkData;
                    if (ink) {
                        const newPoints: { X: number, Y: number }[] = [];
                        var counter = 0;
                        for (var k = 0; k < index; k++) {
                            control.forEach(pt => (pts[k].X === pt.X && pts[k].Y === pt.Y) && counter++);
                        }
                        //decide where to put the new coordinate
                        const spNum = Math.floor(counter / 2) * 4 + 2;

                        for (var i = 0; i < spNum; i++) {
                            ink[i] && newPoints.push({ X: ink[i].X, Y: ink[i].Y });
                        }
                        for (var j = 0; j < 4; j++) {
                            newPoints.push({ X: x, Y: y });

                        }
                        for (var i = spNum; i < ink.length; i++) {
                            newPoints.push({ X: ink[i].X, Y: ink[i].Y });
                        }
                        this._currPoint = -1;
                        Doc.GetProto(doc).data = new InkField(newPoints);
                    }
                }
            }
        }));
    }

    @undoBatch
    @action
    deletePoints = () => {
        this.selectedInk?.forEach(action(inkView => {
            if (this.selectedInk?.length === 1 && this._currPoint !== -1) {
                const doc = Document(inkView.rootDoc);
                if (doc.type === DocumentType.INK) {
                    const ink = Cast(doc.data, InkField)?.inkData;
                    if (ink && ink.length > 4) {
                        const newPoints: { X: number, Y: number }[] = [];
                        const toRemove = Math.floor(((this._currPoint + 2) / 4));
                        for (var i = 0; i < ink.length; i++) {
                            if (Math.floor((i + 2) / 4) !== toRemove) {
                                newPoints.push({ X: ink[i].X, Y: ink[i].Y });
                            }
                        }
                        this._currPoint = -1;
                        Doc.GetProto(doc).data = new InkField(newPoints);
                        if (newPoints.length === 4) {
                            const newerPoints: { X: number, Y: number }[] = [];
                            newerPoints.push({ X: newPoints[0].X, Y: newPoints[0].Y });
                            newerPoints.push({ X: newPoints[0].X, Y: newPoints[0].Y });
                            newerPoints.push({ X: newPoints[3].X, Y: newPoints[3].Y });
                            newerPoints.push({ X: newPoints[3].X, Y: newPoints[3].Y });
                            Doc.GetProto(doc).data = new InkField(newerPoints);

                        }
                    }
                }
            }
        }));
    }

    @undoBatch
    @action
    rotate = (angle: number) => {
        const _centerPoints: { X: number, Y: number }[] = [];
        SelectionManager.SelectedDocuments().forEach(action(inkView => {
            const doc = Document(inkView.rootDoc);
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                const ink = Cast(doc.data, InkField)?.inkData;
                if (ink) {
                    const xs = ink.map(p => p.X);
                    const ys = ink.map(p => p.Y);
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);
                    _centerPoints.push({ X: left, Y: top });
                }
            }
        }));

        var index = 0;
        SelectionManager.SelectedDocuments().forEach(action(inkView => {
            const doc = Document(inkView.rootDoc);
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                doc.rotation = Number(doc.rotation) + Number(angle);
                const ink = Cast(doc.data, InkField)?.inkData;
                if (ink) {

                    const newPoints: { X: number, Y: number }[] = [];
                    ink.forEach(i => {
                        const newX = Math.cos(angle) * (i.X - _centerPoints[index].X) - Math.sin(angle) * (i.Y - _centerPoints[index].Y) + _centerPoints[index].X;
                        const newY = Math.sin(angle) * (i.X - _centerPoints[index].X) + Math.cos(angle) * (i.Y - _centerPoints[index].Y) + _centerPoints[index].Y;
                        newPoints.push({ X: newX, Y: newY });
                    });
                    Doc.GetProto(doc).data = new InkField(newPoints);
                    const xs = newPoints.map(p => p.X);
                    const ys = newPoints.map(p => p.Y);
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);

                    doc._height = (bottom - top);
                    doc._width = (right - left);
                }
                index++;
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
                                (order === 3 && controlNum !== ink.length - 1 && i === controlNum + 2)
                                || ((ink[0].X === ink[ink.length - 1].X) && (ink[0].Y === ink[ink.length - 1].Y) && (i === 0 || i === ink.length - 1) && (controlNum === 0 || controlNum === ink.length - 1))
                            ) {
                                newPoints.push({ X: ink[i].X - (xDiff * inkView.props.ScreenToLocalTransform().Scale), Y: ink[i].Y - (yDiff * inkView.props.ScreenToLocalTransform().Scale) });
                            }
                            else {
                                newPoints.push({ X: ink[i].X, Y: ink[i].Y });
                            }
                        }
                        const oldx = doc.x;
                        const oldy = doc.y;
                        const xs = ink.map(p => p.X);
                        const ys = ink.map(p => p.Y);
                        const left = Math.min(...xs);
                        const top = Math.min(...ys);
                        Doc.GetProto(doc).data = new InkField(newPoints);
                        const xs2 = newPoints.map(p => p.X);
                        const ys2 = newPoints.map(p => p.Y);
                        const left2 = Math.min(...xs2);
                        const top2 = Math.min(...ys2);
                        const right2 = Math.max(...xs2);
                        const bottom2 = Math.max(...ys2);
                        doc._height = (bottom2 - top2);
                        doc._width = (right2 - left2);
                        //if points move out of bounds

                        doc.x = oldx - (left - left2);
                        doc.y = oldy - (top - top2);

                    }
                }
            }
        }));
    }

    @undoBatch
    @action
    switchStk = (color: ColorState) => {
        const val = String(color.hex);
        this.colorStk = val;
        return true;
    }

    @undoBatch
    @action
    switchFil = (color: ColorState) => {
        const val = String(color.hex);
        this.colorFil = val;
        return true;
    }


    colorPicker(setter: (color: string) => {}, type: string) {
        return <div className="btn-group-palette" key="colorpicker" style={{ width: 160, margin: 10 }}>
            <SketchPicker onChange={type === "stk" ? this.switchStk : this.switchFil} presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF', '#f1efeb', 'transparent']}
                color={type === "stk" ? this.colorStk : this.colorFil} />
        </div>;
    }
    inputBox = (key: string, value: any, setter: (val: string) => {}) => {
        return <>
            <input style={{ color: "black", width: 40, position: "absolute", right: 20 }}
                type="text" defaultValue={value}
                onChange={undoBatch(action((e) => setter(e.target.value)))}
                autoFocus />
            <button className="antiMenu-Buttonup" key="up1" onPointerDown={undoBatch(action(() => this.upDownButtons("up", key)))}>
                ˄
            </button>
            <br />
            <button className="antiMenu-Buttonup" key="down1" onPointerDown={undoBatch(action(() => this.upDownButtons("down", key)))} style={{ marginTop: -8 }}>
                ˅
            </button>
        </>;
    }

    inputBoxDuo = (key: string, value: any, setter: (val: string) => {}, title1: string, key2: string, value2: any, setter2: (val: string) => {}, title2: string) => {
        return <>
            {title1}
            <p style={{ marginTop: -20, right: 70, position: "absolute" }}>{title2}</p>

            <input style={{ color: "black", width: 40, position: "absolute", right: 130 }}
                type="text" defaultValue={value}
                onChange={e => setter(e.target.value)}
                autoFocus />
            <button className="antiMenu-Buttonup" key="up2" onPointerDown={undoBatch(action(() => this.upDownButtons("up", key)))} style={{ right: 110 }}>
                ˄
        </button>
            <button className="antiMenu-Buttonup" key="down2" onPointerDown={undoBatch(action(() => this.upDownButtons("down", key)))} style={{ marginTop: 12, right: 110 }}>
                ˅
        </button>
            {title2 === "" ? "" : <>
                <input style={{ color: "black", width: 40, position: "absolute", right: 20 }}
                    type="text" defaultValue={value2}
                    onChange={e => setter2(e.target.value)}
                    autoFocus />
                <button className="antiMenu-Buttonup" key="up3" onPointerDown={undoBatch(action(() => this.upDownButtons("up", key2)))}>
                    ˄
      </button>
                <br />
                <button className="antiMenu-Buttonup" key="down3" onPointerDown={undoBatch(action(() => this.upDownButtons("down", key2)))} style={{ marginTop: -8 }}>
                    ˅
      </button></>}
        </>;
    }


    colorButton(value: string, setter: () => {}) {
        return <>
            <button className="antimodeMenu-button" key="color" onPointerDown={undoBatch(action(e => setter()))} style={{ position: "relative", marginTop: -5 }}>
                <div className="color-previewII" style={{ backgroundColor: value ?? "121212" }} />
                {value === "" || value === "transparent" ? <p style={{ fontSize: 25, color: "red", marginTop: -23, position: "fixed" }}>☒</p> : ""}
            </button>
        </>;
    }

    controlPointsButton() {
        return <>
            <button className="antimodeMenu-button" title="Edit points" key="bezier" onPointerDown={action(() => this._controlBtn = this._controlBtn ? false : true)} style={{ position: "relative", marginTop: 10, backgroundColor: this._controlBtn ? "black" : "" }}>
                <FontAwesomeIcon icon="bezier-curve" size="lg" />
            </button>
            <button className="antimodeMenu-button" title="Lock ratio" key="ratio" onPointerDown={action(() => this._lock = this._lock ? false : true)} style={{ position: "relative", marginTop: 10, backgroundColor: this._lock ? "black" : "" }}>
                <FontAwesomeIcon icon="lock" size="lg" />

            </button>
            <button className="antimodeMenu-button" key="rotate" title="Rotate 90˚" onPointerDown={action(() => this.rotate(Math.PI / 2))} style={{ position: "relative", marginTop: 10, fontSize: 15 }}>
                ⟲
            </button>
            <br /> <br />
        </>;
    }

    lockRatioButton() {
        return <>
            <button className="antimodeMenu-button" key="lock" onPointerDown={action(() => this._lock = this._lock ? false : true)} style={{ position: "absolute", right: 80, backgroundColor: this._lock ? "black" : "" }}>
                {/* <FontAwesomeIcon icon="bezier-curve" size="lg" /> */}
                <FontAwesomeIcon icon="lock" size="lg" />

            </button>
            <br /> <br />
        </>;
    }

    rotate90Button() {
        return <>
            <button className="antimodeMenu-button" key="rot" onPointerDown={action(() => this.rotate(Math.PI / 2))} style={{ position: "absolute", right: 80, }}>
                {/* <FontAwesomeIcon icon="bezier-curve" size="lg" /> */}
                ⟲
            </button>
            <br /> <br />
        </>;
    }
    @computed get fillButton() { return this.colorButton(this.colorFil, () => { this._fillBtn = !this._fillBtn; this._lineBtn = false; return true; }); }
    @computed get lineButton() { return this.colorButton(this.colorStk, () => { this._lineBtn = !this._lineBtn; this._fillBtn = false; return true; }); }

    @computed get fillPicker() { return this.colorPicker((color: string) => this.colorFil = color, "fil"); }
    @computed get linePicker() { return this.colorPicker((color: string) => this.colorStk = color, "stk"); }

    @computed get stkInput() { return this.inputBox("stk", this.widthStk, (val: string) => this.widthStk = val); }
    @computed get dashInput() { return this.inputBox("dsh", this.widthStk, (val: string) => this.widthStk = val); }

    @computed get hgtInput() { return this.inputBoxDuo("hgt", this.shapeHgt, (val: string) => this.shapeHgt = val, "H:", "wid", this.shapeWid, (val: string) => this.shapeWid = val, "W:"); }
    @computed get widInput() { return this.inputBox("wid", this.shapeWid, (val: string) => this.shapeWid = val); }
    @computed get rotInput() { return this.inputBoxDuo("rot", this.shapeRot, (val: string) => { this.rotate(Number(val) - Number(this.shapeRot)); this.shapeRot = val; return true; }, "∠:", "rot", this.shapeRot, (val: string) => this.shapeRot = val, ""); }

    @computed get YpsInput() { return this.inputBox("Yps", this.shapeYps, (val: string) => this.shapeYps = val); }

    @computed get controlPoints() { return this.controlPointsButton(); }
    @computed get lockRatio() { return this.lockRatioButton(); }
    @computed get rotate90() { return this.rotate90Button(); }
    @computed get XpsInput() { return this.inputBoxDuo("Xps", this.shapeXps, (val: string) => this.shapeXps = val, "X:", "Yps", this.shapeYps, (val: string) => this.shapeYps = val, "Y:"); }


    @computed get propertyGroupItems() {
        const fillCheck = <div key="fill" style={{ display: (this._subOpen[0] && this.selectedInk && this.selectedInk.length >= 1) ? "" : "none", width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Fill:
            {this.fillButton}
            <div style={{ float: "left", width: 100 }} >
                Stroke:
            {this.lineButton}
            </div>

            {this._fillBtn ? this.fillPicker : ""}
            {this._lineBtn ? this.linePicker : ""}
            {this._fillBtn || this._lineBtn ? "" : <br />}
            {(this.solidStk || this.dashdStk) ? "Width" : ""}
            {(this.solidStk || this.dashdStk) ? this.stkInput : ""}
            {(this.solidStk || this.dashdStk) ? <input type="range" defaultValue={Number(this.widthStk)} min={1} max={100} onChange={undoBatch(action((e) => this.widthStk = e.target.value))} /> : (null)}
            <br />
            {(this.solidStk || this.dashdStk) ? <>
                <p style={{ position: "absolute", fontSize: 12 }}>Arrow Head</p>
                <input key="markHead" className="formatShapePane-inputBtn" type="checkbox" checked={this.markHead !== ""} onChange={undoBatch(action(() => this.markHead = this.markHead ? "" : "arrow"))} style={{ position: "absolute", right: 110, width: 20 }} />
                <p style={{ position: "absolute", fontSize: 12, right: 30 }}>Arrow End</p>
                <input key="markTail" className="formatShapePane-inputBtn" type="checkbox" checked={this.markTail !== ""} onChange={undoBatch(action(() => this.markTail = this.markTail ? "" : "arrow"))} style={{ position: "absolute", right: 0, width: 20 }} />
                <br />
            </> : ""}
            Dash:
            <input key="markHead" className="formatShapePane-inputBtn" type="checkbox" checked={this.dashdStk === "2"} onChange={undoBatch(action(() => this.dashdStk = this.dashdStk === "2" ? "0" : "2"))} style={{ position: "absolute", right: 110, width: 20 }} />
        </div>;



        const sizeCheck =

            <div key="sizeCheck" style={{ display: (this._subOpen[1] && this.selectedInk && this.selectedInk.length >= 1) ? "" : "none", width: "inherit", backgroundColor: "#323232", color: "white", }}>
                {this.controlPoints}
                {this.hgtInput}
                {this.XpsInput}
                {this.rotInput}

            </div>;


        const subMenus = this._currMode === "fill-drip" ? [`Appearance`, 'Transform'] : [];
        const menuItems = this._currMode === "fill-drip" ? [fillCheck, sizeCheck] : [];
        const indexOffset = 0;

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
        return this.getElementVert([this.closeBtn,
        this.propertyGroupItems]);
    }
}