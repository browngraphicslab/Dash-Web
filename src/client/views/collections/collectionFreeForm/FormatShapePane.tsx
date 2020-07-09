import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { observable, action, computed } from "mobx";
import "./FormatShapePane.scss";
import { SetActiveInkWidth } from "../../InkingStroke";
import { Scripting } from "../../../util/Scripting";
import { InkField } from "../../../../fields/InkField";
import { Doc } from "../../../../fields/Doc";
import { SelectionManager } from "../../../util/SelectionManager";
import { DocumentView } from "../../../views/nodes/DocumentView";
import { Document } from "../../../../fields/documentSchemas";
import { DocumentType } from "../../../documents/DocumentTypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faRulerCombined, faFillDrip, faPenNib } from "@fortawesome/free-solid-svg-icons";
import { Cast, StrCast, BoolCast, NumCast } from "../../../../fields/Types";
import e = require("express");

library.add(faRulerCombined, faFillDrip, faPenNib);

@observer
export default class FormatShapePane extends AntimodeMenu {
    static Instance: FormatShapePane;

    private _palette = ["#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321", "#417505", "#9013FE", "#4A90E2", "#50E3C2", "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF"];
    private _width = ["1", "5", "10", "100"];
    private _mode = ["fill-drip", "ruler-combined"];
    private _subMenu = ["fill", "line", "size", "position"];
    @observable private _subOpen = [false, false, false, false];
    @observable private collapsed: boolean = false;
    @observable private currMode: string = "fill-drip";
    @observable _fillBtn = false;
    @observable _lineBtn = false;
    @observable _selectDoc: DocumentView[] = [];
    @observable _noFill = false;
    @observable _solidFill = false;
    @observable _noLine = false;
    @observable _solidLine = false;
    @observable _dashLine = false;
    @observable _lock = false;
    @observable _multiple = false;
    @observable _widthBtn = false;
    @observable _single = false;
    @observable _arrowHead = false;
    @observable _arrowEnd = false;
    @observable _currSizeHeight = "10";
    @observable _currSizeWidth = "10";
    @observable _currRotation = "10";
    @observable _currPositionHorizontal = "10";
    @observable _currPositionVertical = "10";
    @observable _currWidth = "10";
    @observable _currFill = "#D0021B";
    @observable _currColor = "#D0021B";

    constructor(props: Readonly<{}>) {
        super(props);
        FormatShapePane.Instance = this;
        this._canFade = false;
        this.Pinned = BoolCast(Doc.UserDoc()["formatShapePane-pinned"]);
    }

    @action
    toggleMenuPin = (e: React.MouseEvent) => {
        Doc.UserDoc()["formatShapePane-pinned"] = this.Pinned = !this.Pinned;
    }

    @action
    protected toggleCollapse = (e: React.MouseEvent) => {
        this.collapsed = !this.collapsed;
        setTimeout(() => {
            const x = Math.min(this._left, window.innerWidth - FormatShapePane.Instance.width);
            FormatShapePane.Instance.jumpTo(x, this._top, true);
        }, 0);
    }

    @action
    closePane = () => {
        this.jumpTo(-300, -300);
        this.Pinned = false;
    }

    //if multiple inks are selected and do not share the same prop, leave blank
    @action
    checkSame = () => {
        const docs = SelectionManager.SelectedDocuments();
        const inks: DocumentView[] = [];
        for (var i = 0; i < docs.length; i++) {
            if (Document(docs[i].rootDoc).type === DocumentType.INK) {
                inks.push(docs[i]);
            }
        }
        this._noFill = Document(inks[0].rootDoc).fillColor === "none" ? true : false;
        this._solidFill = Document(inks[0].rootDoc).fillColor === "none" ? false : true;
        this._noLine = Document(inks[0].rootDoc).color === "none" ? true : false;
        if (Document(inks[0].rootDoc).color !== "none") {
            this._solidLine = true;
            this._dashLine = true;
            if (Document(inks[0].rootDoc).dash === "0") {
                this._dashLine = false;
            } else {
                this._solidLine = false;

            }
        }
        this._currWidth = String(Document(inks[0].rootDoc).strokeWidth);
        this._currFill = String(Document(inks[0].rootDoc).fillColor);
        this._currColor = String(Document(inks[0].rootDoc).color);
        this._arrowHead = Document(inks[0].rootDoc).arrowStart === "none" ? false : true;
        this._arrowEnd = Document(inks[0].rootDoc).arrowEnd === "none" ? false : true;
        this._currSizeHeight = String(Document(inks[0].rootDoc)._height);
        this._currSizeWidth = String(Document(inks[0].rootDoc)._width);
        this._currRotation = String(Document(inks[0].rootDoc).rotation);
        this._currPositionHorizontal = String(Document(inks[0].rootDoc).x);
        this._currPositionVertical = String(Document(inks[0].rootDoc).y);
        for (var i = 0; i < inks.length; i++) {
            if (Document(inks[i].rootDoc).strokeWidth !== Document(inks[0].rootDoc).strokeWidth) {
                this._currWidth = "";
            }
            if (Document(inks[i].rootDoc).color !== Document(inks[0].rootDoc).color) {
                this._noLine = false;
                this._solidLine = false;
                this._dashLine = false;
            }
            if (Document(inks[i].rootDoc).fillColor !== Document(inks[0].rootDoc).fillColor) {
                this._solidFill = false;
                this._noFill = false;
            }
            if (Document(inks[i].rootDoc).arrowStart !== Document(inks[0].rootDoc).arrowStart) {
                this._arrowHead = false;
            }
            if (Document(inks[i].rootDoc).arrowEnd !== Document(inks[0].rootDoc).arrowEnd) {
                this._arrowEnd = false;
            }
            if (Document(inks[i].rootDoc).x !== Document(inks[0].rootDoc).x) {
                this._currPositionHorizontal = "";
            }
            if (Document(inks[i].rootDoc).y !== Document(inks[0].rootDoc).y) {
                this._currPositionVertical = "";
            }
            if (Document(inks[i].rootDoc)._width !== Document(inks[0].rootDoc)._width) {
                this._currSizeWidth = "";
            }
            if (Document(inks[i].rootDoc)._height !== Document(inks[0].rootDoc)._height) {
                this._currSizeHeight = "";
            }
            if (Document(inks[i].rootDoc).rotation !== Document(inks[0].rootDoc).rotation) {
                this._currRotation = "";
            }
        }
    }


    @action
    upDownButtons = (dirs: string, field: string) => {
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK) {
                switch (field) {
                    case "width":
                        if (doc.strokeWidth) {
                            doc.strokeWidth = dirs === "up" ? doc.strokeWidth + 1 : doc.strokeWidth - 1;
                            SetActiveInkWidth(String(doc.strokeWidth));
                        }
                        break;
                    case "sizeWidth":
                        if (doc._width && doc._height) {
                            const oldWidth = doc._width;
                            const oldHeight = doc._height;
                            doc._width = dirs === "up" ? doc._width + 10 : doc._width - 10;
                            if (this._lock) {
                                doc._height = (doc._width * oldHeight) / oldWidth;
                            }
                        }
                        break;
                    case "sizeHeight":
                        if (doc._width && doc._height) {
                            const oldWidth = doc._width;
                            const oldHeight = doc._height;
                            doc._height = dirs === "up" ? doc._height + 10 : doc._height - 10;
                            if (this._lock) {
                                doc._width = (doc._height * oldWidth) / oldHeight;
                            }
                        }
                        break;
                    case "horizontal":
                        if (doc.x) {
                            doc.x = dirs === "up" ? doc.x + 10 : doc.x - 10;
                        }
                        break;
                    case "vertical":
                        if (doc.y) {
                            doc.y = dirs === "up" ? doc.y + 10 : doc.y - 10;
                        }
                    case "rotation":
                        this.rotate(dirs === "up" ? Number(doc.rotation) + Number(0.1) : Number(doc.rotation) - Number(0.1));
                        break;
                    default:
                        break;
                }
                this.selected();
            }
        }));
    }


    @action
    editProperties = (value: any, field: string) => {
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK) {
                switch (field) {
                    case "width":
                        SetActiveInkWidth(value);
                        doc.strokeWidth = Number(value);
                        break;
                    case "color":
                        doc.color = String(value);
                        break;
                    case "fill":
                        doc.fillColor = String(value);
                        break;
                    case "bezier":
                        break;
                    case "arrowStart":
                        doc.arrowStart = String(value);
                        break;
                    case "arrowEnd":
                        doc.arrowEnd = String(value);
                        break;
                    case "dash":
                        doc.dash = String(value);
                        break;
                    case "widthSize":
                        if (doc._width && doc._height) {
                            const oldWidth = doc._width;
                            const oldHeight = doc._height;
                            doc._width = Number(value);
                            if (this._lock) {
                                doc._height = (doc._width * oldHeight) / oldWidth;
                            }
                        }
                        break;
                    case "heightSize":
                        if (doc._width && doc._height) {
                            const oldWidth = doc._width;
                            const oldHeight = doc._height;
                            doc._height = Number(value);
                            if (this._lock) {
                                doc._width = (doc._height * oldWidth) / oldHeight;
                            }
                        }
                        break;
                    case "horizontal":
                        doc.x = Number(value);
                        break;
                    case "vertical":
                        doc.y = Number(value);
                        break;
                    default:
                        break;
                }
            }
            this.selected();
        }));
        this.checkSame();

    }

    @computed get close() {
        const close = <button
            className="antimodeMenu-button"
            key="close"
            onPointerDown={action(() => { this.closePane(); })}
            style={{ right: 0, position: "absolute" }}>
            X
                </button>;
        return close;
    }

    //select either coor&fill or size&position
    @computed get modes() {
        const modes = <div className="antimodeMenu-button-tab">
            {this._mode.map(mode => {
                return <button
                    className="antimodeMenu-button"
                    key={mode}
                    onPointerDown={action(() => { this.currMode = mode; })}
                    style={{ backgroundColor: this.currMode === mode ? "121212" : "", position: "relative", top: 30 }}>
                    <FontAwesomeIcon icon={mode as IconProp} size="lg" />
                </button>;
            })
            }</div>;
        return modes;
    }

    //detects currently selected document and change value in pane
    @action
    selected = () => {
        this._selectDoc = SelectionManager.SelectedDocuments();
        if (this._selectDoc.length === 1 && Document(this._selectDoc[0].rootDoc).type === DocumentType.INK) {
            this._single = true;
            const doc = Document(this._selectDoc[0].rootDoc);
            if (doc.type === DocumentType.INK) {
                if (doc.fillColor === "none") {
                    this._noFill = true;
                    this._solidFill = false;
                } else {
                    this._solidFill = true;
                    this._noFill = false;
                    this._currFill = String(doc.fillColor);
                }
                if (doc.color === "none") {
                    this._noLine = true;
                    this._solidLine = false;
                    this._dashLine = false;
                } else {
                    console.log(doc.strokeWidth);
                    this._currWidth = String(doc.strokeWidth);
                    this._currColor = String(doc.color);
                    if (doc.dash === "0") {
                        this._solidLine = true;
                        this._noLine = false;
                        this._dashLine = false;
                    } else {
                        this._dashLine = true;
                        this._noLine = false;
                        this._solidLine = false;
                    }

                    this._arrowHead = doc.arrowStart === "none" ? false : true;
                    this._arrowEnd = doc.arrowEnd === "none" ? false : true;
                    this._currPositionHorizontal = String(doc.x);
                    this._currPositionVertical = String(doc.y);
                    this._currRotation = String(doc.rotation);
                    this._currSizeHeight = String(doc._height);
                    this._currSizeWidth = String(doc._width);
                }

            }
        } else {
            this._noFill = false;
            this._solidFill = false;
            this._single = false;
            this._currFill = "#D0021B";
            this._noLine = false;
            this._solidLine = false;
            this._dashLine = false;
            this._currColor = "#D0021B";
            this._arrowHead = false;
            this._arrowEnd = false;
            this._currPositionHorizontal = "";
            this._currPositionVertical = "";
            this._currRotation = "";
            this._currSizeHeight = "";
            this._currSizeWidth = "";
        }
        this.checkSame();
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

    @action
    toggle = (check: string) => {
        switch (check) {
            case "noFill":
                if (!this._noFill) {
                    this._noFill = true;
                    this._solidFill = false;
                }
                break;
            case "solidFill":
                if (!this._solidFill) {
                    this._solidFill = true;
                    this._noFill = false;
                    if (this._currFill === "none") {
                        this._currFill = "#D0021B";
                    }
                }
                break;
            case "noLine":
                if (!this._noLine) {
                    this._noLine = true;
                    this._solidLine = false;
                    this._dashLine = false;
                }
                break;
            case "solidLine":
                if (!this._solidLine) {
                    this._solidLine = true;
                    this._noLine = false;
                    this._dashLine = false;
                    if (this._currColor === "none") {
                        this._currColor = "#D0021B";
                    }
                }
                break;
            case "dashLine":
                if (!this._dashLine) {
                    this._dashLine = true;
                    this._solidLine = false;
                    this._noLine = false;
                    if (this._currColor === "none") {
                        this._currColor = "#D0021B";
                    }
                }
                break;
            case "lock":
                if (this._lock) {
                    this._lock = false;
                } else {
                    this._lock = true;
                }
                break;
            case "arrowHead":
                this._arrowHead = this._arrowHead ? false : true;
                break;
            case "arrowEnd":
                this._arrowEnd = this._arrowEnd ? false : true;
                break;
            default:
                break;
        }
    }

    @computed get subMenu() {
        const fillCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            <input id="nofill" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._noFill} onChange={action(() => { this.toggle("noFill"); this.editProperties("none", "fill"); })} />
            No Fill
            <br></br>
            <input id="solidfill" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._solidFill} onChange={action(() => { this.toggle("solidFill"); this.editProperties(this._currFill, "fill"); })} />
            Solid Fill
            <br></br>
            <br></br>
            {this._solidFill ? "Color" : ""}
            {this._solidFill ? this.fillButton : ""}
            {this._fillBtn && this._solidFill ? this.fillPicker : ""}

        </div>;
        const arrows = <> <input id="arrowHead" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._arrowHead} onChange={action(() => { this.toggle("arrowHead"); this.editProperties(this._arrowHead ? "arrowHead" : "none", "arrowStart"); })} />
         Arrow Head
            <br></br>

            <input id="arrowEnd" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._arrowEnd} onChange={action(() => { this.toggle("arrowEnd"); this.editProperties(this._arrowEnd ? "arrowEnd" : "none", "arrowEnd"); })} />
         Arrow End
            <br></br></>;
        const lineCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            <input id="noLine" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._noLine} onChange={action(() => { this.toggle("noLine"); this.editProperties("none", "color"); })} />
                No Line
                <br></br>
            <input id="solidLine" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._solidLine} onChange={action(() => { this.toggle("solidLine"); this.editProperties(this._currColor, "color"); this.editProperties("0", "dash"); })} />
                Solid Line
                <br></br>
            <input id="dashLine" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._dashLine} onChange={action(() => { this.toggle("dashLine"); this.editProperties(this._currColor, "color"); this.editProperties("2", "dash"); })} />
                Dash Line
                <br></br>
            <br></br>
            {(this._solidLine || this._dashLine) ? "Color" : ""}
            {(this._solidLine || this._dashLine) ? this.lineButton : ""}
            {this._lineBtn && (this._solidLine || this._dashLine) ? this.linePicker : ""}
            <br></br>
            {(this._solidLine || this._dashLine) ? "Width" : ""}
            {(this._solidLine || this._dashLine) ? this.widthInput : ""}
            <br></br>
            <br></br>
            {(this._solidLine || this._dashLine) ? arrows : ""}

        </div>;

        const sizeCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Height {this.sizeHeightInput}
            <br></br>
            <br></br>


            Width {this.sizeWidthInput}
            <br></br>
            <br></br>

            <input id="lock" style={{ width: "inherit", position: "absolute", right: 0 }} type="checkbox" checked={this._lock} onChange={action(() => { this.toggle("lock"); })} />
                Lock Ratio
            <br></br>
            <br></br>


            Rotation {this.rotationInput}
            <br></br>
            <br></br>


        </div>;
        const positionCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Horizontal {this.positionHorizontalInput}
            <br></br>
            <br></br>

            Vertical {this.positionVerticalInput}
            <br></br>
            <br></br>


        </div>;

        const subMenu = <div className="antimodeMenu-sub" style={{ position: "absolute", width: "inherit", top: 60 }}>
            {this._subMenu.map((subMenu, i) => {
                if (subMenu === "fill" || subMenu === "line") {
                    return <div style={{ width: "inherit" }}><button
                        className="antimodeMenu-button"
                        key={subMenu}
                        onPointerDown={action(() => { this._subOpen[i] = this._subOpen[i] ? false : true; })}
                        style={{ backgroundColor: "121212", display: this.currMode === "fill-drip" ? "" : "none", width: "inherit", textAlign: "left" }}>
                        {this._subOpen[i] ? "▼" : "▶︎"}
                        {subMenu}
                    </button>
                        {this.currMode === "fill-drip" && subMenu === "fill" && this._subOpen[0] ? fillCheck : ""}
                        {this.currMode === "fill-drip" && subMenu === "line" && this._subOpen[1] ? lineCheck : ""}

                    </div>;
                }
                else if (subMenu === "size" || subMenu === "position") {
                    return <div style={{ width: "inherit" }}><button
                        className="antimodeMenu-button"
                        key={subMenu}
                        onPointerDown={action(() => { this._subOpen[i] = this._subOpen[i] ? false : true; })}
                        style={{ backgroundColor: "121212", display: this.currMode === "ruler-combined" ? "" : "none", width: "inherit", textAlign: "left" }}>
                        {this._subOpen[i] ? "▼" : "▶︎"}
                        {subMenu}
                    </button>
                        {this.currMode === "ruler-combined" && subMenu === "size" && this._subOpen[2] ? sizeCheck : ""}
                        {this.currMode === "ruler-combined" && subMenu === "position" && this._subOpen[3] ? positionCheck : ""}

                    </div>
                        ;

                }
            })
            }</div>;
        return subMenu;
    }

    @computed get fillButton() {
        const fillButton = <><button
            className="antimodeMenu-button"
            key="fill"
            title="fillChanger"
            onPointerDown={action(e => this._fillBtn = !this._fillBtn)}
            style={{
                // backgroundColor: "121212",
                position: "absolute", right: 80
            }}>
            <FontAwesomeIcon icon="fill-drip" size="lg" />
            <div className="color-previewI" style={{ backgroundColor: this._currFill ?? "121212" }}></div>
        </button>
            <br></br>
            <br></br></>;
        return fillButton;
    }
    @computed get fillPicker() {
        const fillPicker = <div className="btn-group-palette" key="fill" >
            {this._palette.map(color => {
                return <button
                    className="antimodeMenu-button"
                    key={color}
                    onPointerDown={action(() => { this._currFill = color; this.editProperties(color, "fill"); })}
                    style={{
                        // backgroundColor: this._fillBtn ? "121212" : "",
                        zIndex: 1001
                    }}>
                    <div className="color-previewII" style={{ backgroundColor: color }}></div>
                </button>;
            })}

        </div>;
        return fillPicker;
    }

    @computed get lineButton() {
        const lineButton = <><button
            className="antimodeMenu-button"
            key="line"
            title="lineChanger"
            onPointerDown={action(e => this._lineBtn = !this._lineBtn)}
            style={{
                // backgroundColor: "121212",
                position: "absolute", right: 80
            }}>
            <FontAwesomeIcon icon="pen-nib" size="lg" />
            <div className="color-previewI" style={{ backgroundColor: this._currColor ?? "121212" }}></div>
        </button>
            <br></br>
            <br></br></>;
        return lineButton;
    }
    @computed get linePicker() {
        const linePicker = <div className="btn-group-palette" key="line" >
            {this._palette.map(color => {
                return <button
                    className="antimodeMenu-button"
                    key={color}
                    onPointerDown={action(() => { this._currColor = color; this.editProperties(color, "color"); })}
                    style={{
                        // backgroundColor: this._lineBtn ? "121212" : "",
                        zIndex: 1001
                    }}>
                    <div className="color-previewII" style={{ backgroundColor: color }}></div>
                </button>;
            })}

        </div>;
        return linePicker;
    }
    @computed get widthInput() {
        const widthInput = <>
            <input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currWidth}
                onChange={e => this.onChange(e.target.value, "width")}
                autoFocus></input>  <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("up", "width"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                ˄
            </button>
            <br />
            <button
                className="antiMenu-Buttonup"
                key="up"
                onPointerDown={action(() => { this.upDownButtons("down", "width"); })}
                style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0, marginTop: -8 }}>
                ˅
            </button></>;
        return widthInput;
    }
    @computed get sizeHeightInput() {
        const sizeHeightInput = <>
            <input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currSizeHeight}
                onChange={e => this.onChange(e.target.value, "sizeHeight")}
                autoFocus></input>
            <button
                className="antiMenu-Buttonup"
                key="up"
                onPointerDown={action(() => { this.upDownButtons("up", "sizeHeight"); })}
                style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                ˄
            </button>
            <br />
            <button
                className="antiMenu-Buttonup"
                key="up"
                onPointerDown={action(() => { this.upDownButtons("down", "sizeHeight"); })}
                style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0, marginTop: -8 }}>
                ˅
            </button>
        </>;
        return sizeHeightInput;
    }

    @computed get sizeWidthInput() {
        const sizeWidthInput = <>
            <input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currSizeWidth}
                onChange={e => this.onChange(e.target.value, "sizeWidth")}
                autoFocus></input>
            <button
                className="antiMenu-Buttonup"
                key="up"
                onPointerDown={action(() => { this.upDownButtons("up", "sizeWidth"); })}
                style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                ˄
            </button>
            <br></br>
            <button
                className="antiMenu-Buttonup"
                key="up"
                onPointerDown={action(() => { this.upDownButtons("down", "sizeWidth"); })}
                style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0, marginTop: -8 }}>
                ˅
            </button></>;
        return sizeWidthInput;
    }

    @computed get rotationInput() {
        const rotationInput =
            <>
                <input
                    style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                    type="text" value={this._currRotation}
                    onChange={e => this.onChange(e.target.value, "rotation")}
                    autoFocus></input>
                <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("up", "rotation"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                    ˄
            </button>
                <br></br>
                <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("down", "rotation"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0, marginTop: -8 }}>
                    ˅
            </button></>;
        return rotationInput;
    }

    @computed get positionHorizontalInput() {
        const positionHorizontalInput =
            <><input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currPositionHorizontal}
                onChange={e => this.onChange(e.target.value, "positionHorizontal")}
                autoFocus></input>
                <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("up", "horizontal"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                    ˄
            </button>
                <br></br>
                <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("down", "horizontal"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0, marginTop: -8 }}>
                    ˅
            </button></>;
        return positionHorizontalInput;
    }

    @computed get positionVerticalInput() {
        const positionVerticalInput =
            <><input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currPositionVertical}
                onChange={e => this.onChange(e.target.value, "positionVertical")}
                autoFocus></input>
                <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("down", "vertical"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                    ˄
            </button>
                <br></br>
                <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("up", "vertical"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0, marginTop: -8 }}>
                    ˅
            </button></>;
        return positionVerticalInput;
    }

    //change inputs
    @action
    onChange = (val: string, property: string): void => {
        if (!Number.isNaN(Number(val)) && Number(val) !== null && val !== " ") {

            switch (property) {
                case "width":
                    this._currWidth = val;
                    if (val !== "") {
                        this.editProperties(this._currWidth, "width");
                    }
                    break;
                case "sizeHeight":
                    this._currSizeHeight = val;
                    if (val !== "") {
                        this.editProperties(this._currSizeHeight, "heightSize");
                    }
                    break;
                case "sizeWidth":
                    this._currSizeWidth = val;
                    if (val !== "") {

                        this.editProperties(this._currSizeWidth, "widthSize");
                    }
                    break;
                case "rotation":

                    this._currRotation = val;
                    if (val !== "") {

                        this.rotate(Number(val));
                    }
                    break;
                case "positionHorizontal":
                    this._currPositionHorizontal = val; if (val !== "") {

                        this.editProperties(this._currPositionHorizontal, "horizontal");
                    }

                    break;
                case "positionVertical":
                    this._currPositionVertical = val;
                    if (val !== "") {

                        this.editProperties(this._currPositionVertical, "vertical");
                    }

                    break;
                default:
                    break;
            }
        }
    }


    @computed get widthPicker() {
        var widthPicker = <button
            className="antimodeMenu-button"
            key="width"
            onPointerDown={action(e => this._widthBtn = !this._widthBtn)}
            style={{ backgroundColor: this._widthBtn ? "121212" : "" }}>
            <FontAwesomeIcon icon="bars" size="lg" />
        </button>;
        if (this._widthBtn) {
            widthPicker = <div className="btn2-group" key="width">
                {widthPicker}
                {this._width.map(wid => {
                    return <button
                        className="antimodeMenu-button"
                        key={wid}
                        onPointerDown={action(() => { SetActiveInkWidth(wid); this._widthBtn = false; this.editProperties(wid, "width"); })}
                        style={{ backgroundColor: this._widthBtn ? "121212" : "" }}>
                        {wid}
                    </button>;
                })}
            </div>;
        }
        return widthPicker;
    }



    render() {
        const buttons = [

            this.close,
            this.modes,
            this.subMenu

        ];

        return this.getElementVert(buttons);
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