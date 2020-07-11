import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { observable, action, computed } from "mobx";
import "./FormatShapePane.scss";
import { Scripting } from "../../../util/Scripting";
import { InkField } from "../../../../fields/InkField";
import { Doc, Opt } from "../../../../fields/Doc";
import { SelectionManager } from "../../../util/SelectionManager";
import { DocumentView } from "../../../views/nodes/DocumentView";
import { Document } from "../../../../fields/documentSchemas";
import { DocumentType } from "../../../documents/DocumentTypes";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faRulerCombined, faFillDrip, faPenNib } from "@fortawesome/free-solid-svg-icons";
import { Cast, StrCast, BoolCast, NumCast } from "../../../../fields/Types";

library.add(faRulerCombined, faFillDrip, faPenNib);

@observer
export default class FormatShapePane extends AntimodeMenu {
    static Instance: FormatShapePane;

    private _palette = ["#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321", "#417505", "#9013FE", "#4A90E2", "#50E3C2", "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF"];
    private _width = ["1", "5", "10", "100"];
    private _mode = ["fill-drip", "ruler-combined"];
    private _subMenu = ["fill", "line", "size", "position"];
    @computed get inks() {
        const inks: DocumentView[] = [];
        const docs = SelectionManager.SelectedDocuments();
        for (var i = 0; i < docs.length; i++) {
            if (Document(docs[i].rootDoc).type === DocumentType.INK) {
                inks.push(docs[i]);
            }
        }
        return inks.length ? inks : undefined;
    }
    @observable private _subOpen = [false, false, false, false];
    @observable private collapsed: boolean = false;
    @observable private currMode: string = "fill-drip";
    @observable _lock = false;
    @observable _fillBtn = false;
    @observable _lineBtn = false;
    _lastFill = "#D0021B";
    _lastLine = "#D0021B";
    _lastDash = "2";

    @computed get _noFill() {
        return this.inks?.reduce((p, i) => p && !i.rootDoc.fillColor ? true : false, true) || false;
    }
    @computed get _solidFill() {
        return this.inks?.reduce((p, i) => p && i.rootDoc.fillColor ? true : false, true) || false;
    }
    set _noFill(value) { this._currFill = value ? "" : this._lastFill; }
    set _solidFill(value) { this._noFill = !value; }

    @computed get _noLine() {
        return this.inks?.reduce((p, i) => p && !i.rootDoc.color ? true : false, true) || false;
    }
    @computed get _solidLine() {
        return this.inks?.reduce((p, i) => p &&
            i.rootDoc.color && (i.rootDoc.dash === undefined || i.rootDoc.dash === "0") ? true : false, true) || false;
    }
    @computed get _dashLine() {
        return !this._noLine && this.inks?.reduce((p, i) =>
            (p === undefined || (p && p === i.rootDoc.dash)) && i.rootDoc.dash !== "0" ? StrCast(i.rootDoc.dash) : "", undefined as Opt<string>) || "";
    }
    set _noLine(value) { this._currColor = value ? "" : this._lastLine; }
    set _solidLine(value) { this._dashLine = ""; this._noLine = !value; }
    set _dashLine(value) {
        value && (this._lastDash = value); this._noLine = false;
        this.inks?.forEach(i => i.rootDoc.dash = value ? this._lastDash : undefined)
    }

    @computed get _currFill() {
        const cfill = this._noFill || !this.inks ? "" : StrCast(this.inks[0].rootDoc.fillColor);
        cfill && (this._lastFill = cfill);
        return cfill;
    }
    @computed get _currColor() {
        const ccol = this._noLine || !this.inks ? "" : StrCast(this.inks[0].rootDoc.color, "");
        this._lastLine = ccol ? ccol : this._lastLine;
        return ccol;
    }
    set _currFill(value) { value && (this._lastFill = value); this.inks?.forEach(i => i.rootDoc.fillColor = value); }
    set _currColor(value) { value && (this._lastLine = value); this.inks?.forEach(i => i.rootDoc.color = value ? value : undefined) }

    @computed get _arrowStart() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p && p === i.rootDoc.arrowStart)) ? StrCast(i.rootDoc.arrowStart) : "", undefined as Opt<string>) || "";
    }
    @computed get _arrowEnd() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p && p === i.rootDoc.arrowEnd)) ? StrCast(i.rootDoc.arrowEnd) : "", undefined as Opt<string>) || ""
    }
    set _arrowStart(value) { this.inks?.forEach(i => i.rootDoc.arrowStart = value); }
    set _arrowEnd(value) { this.inks?.forEach(i => i.rootDoc.arrowEnd = value); }

    @computed get _currSizeHeight() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p === NumCast(i.rootDoc._height).toString())) ? NumCast(i.rootDoc._height).toString() : "", undefined as Opt<string>) || ""
    }
    @computed get _currSizeWidth() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p === NumCast(i.rootDoc._width).toString())) ? NumCast(i.rootDoc._width).toString() : "", undefined as Opt<string>) || ""
    }
    @computed get _currRotation() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p === NumCast(i.rootDoc.rotation).toString())) ? NumCast(i.rootDoc.rotation).toString() : "", undefined as Opt<string>) || ""
    }
    @computed get _currPositionHorizontal() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p === NumCast(i.rootDoc.x).toString())) ? NumCast(i.rootDoc.x).toString() : "", undefined as Opt<string>) || ""
    }
    @computed get _currPositionVertical() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p === NumCast(i.rootDoc.y).toString())) ? NumCast(i.rootDoc.y).toString() : "", undefined as Opt<string>) || ""
    }
    @computed get _currStrokeWidth() {
        return this.inks?.reduce((p, i) =>
            (p === undefined || (p === NumCast(i.rootDoc.strokeWidth).toString())) ? NumCast(i.rootDoc.strokeWidth).toString() : "", undefined as Opt<string>) || ""
    }
    set _currPositionHorizontal(value) { this.inks?.forEach(i => i.rootDoc.x = Number(value)); }
    set _currPositionVertical(value) { this.inks?.forEach(i => i.rootDoc.y = Number(value)); }
    set _currRotation(value) { this.inks?.forEach(i => i.rootDoc.rotation = Number(value)); }
    set _currStrokeWidth(value) { this.inks?.forEach(i => i.rootDoc.strokeWidth = Number(value)); }
    set _currSizeWidth(value) {
        this.inks?.forEach(i => {
            const doc = i.rootDoc;
            if (doc._width && doc._height) {
                const oldWidth = NumCast(doc._width);
                const oldHeight = NumCast(doc._height);
                doc._width = Number(value);
                if (this._lock) {
                    doc._height = (doc._width * oldHeight) / oldWidth;
                }
            }
        });
    }
    set _currSizeHeight(value) {
        this.inks?.forEach(i => {
            const doc = i.rootDoc;
            if (doc._width && doc._height) {
                const oldWidth = NumCast(doc._width);
                const oldHeight = NumCast(doc._height);
                doc._height = Number(value);
                if (this._lock) {
                    doc._width = (doc._height * oldWidth) / oldHeight;
                }
            }
        });
    }

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
                        const oldHeight = NumCast(doc._height)
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
        const fillCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
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
        const arrows = <> <input id="arrowStart" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._arrowStart !== ""} onChange={action(() => this._arrowStart = this._arrowStart ? "" : "arrow")} />
         Arrow Head
            <br />

            <input id="arrowEnd" style={{ width: "inherit", position: "absolute" }} type="checkbox" checked={this._arrowEnd !== ""} onChange={action(() => this._arrowEnd = this._arrowEnd ? "" : "arrow")} />
         Arrow End
            <br /></>;
        const lineCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
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

        const sizeCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
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
        const positionCheck = <div style={{ width: "inherit", backgroundColor: "#323232", color: "white", }}>
            Horizontal {this.positionHorizontalInput}
            <br />
            <br />

            Vertical {this.positionVerticalInput}
            <br />
            <br />


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
        return <>
            <button
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
            <br></br>
        </>;
    }
    @computed get fillPicker() {
        return <div className="btn-group-palette" key="fill" >
            {this._palette.map(color => {
                return <button
                    className="antimodeMenu-button"
                    key={color}
                    onPointerDown={action(() => this._currFill = color)}
                    style={{
                        // backgroundColor: this._fillBtn ? "121212" : "",
                        zIndex: 1001
                    }}>
                    <div className="color-previewII" style={{ backgroundColor: color }}></div>
                </button>;
            })}

        </div>;
    }

    @computed get lineButton() {
        return <>
            <button
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
            <br />
            <br />
        </>;
    }
    @computed get linePicker() {
        return <div className="btn-group-palette" key="line" >
            {this._palette.map(color => {
                return <button
                    className="antimodeMenu-button"
                    key={color}
                    onPointerDown={action(() => this._currColor = color)}
                    style={{
                        // backgroundColor: this._lineBtn ? "121212" : "",
                        zIndex: 1001
                    }}>
                    <div className="color-previewII" style={{ backgroundColor: color }}></div>
                </button>;
            })}

        </div>;
    }
    @computed get widthInput() {
        const widthInput = <>
            <input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currStrokeWidth}
                onChange={e => this._currStrokeWidth = e.target.value}
                autoFocus />
            <button
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
                onChange={e => this._currSizeHeight = e.target.value}
                autoFocus />
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
                onChange={e => this._currSizeWidth = e.target.value}
                autoFocus />
            <button
                className="antiMenu-Buttonup"
                key="up"
                onPointerDown={action(() => { this.upDownButtons("up", "sizeWidth"); })}
                style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                ˄
            </button>
            <br />
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
                    onChange={e => this._currRotation = e.target.value}
                    autoFocus></input>
                <button
                    className="antiMenu-Buttonup"
                    key="up"
                    onPointerDown={action(() => { this.upDownButtons("up", "rotation"); })}
                    style={{ position: "absolute", width: 20, height: 10, right: 0, padding: 0 }}>
                    ˄
            </button>
                <br />
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
        return <>
            <input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currPositionHorizontal}
                onChange={e => this._currPositionHorizontal = e.target.value}
                autoFocus
            />
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
            </button>
        </>;
    }

    @computed get positionVerticalInput() {
        return <>
            <input
                style={{ color: "black", width: 80, position: "absolute", right: 20 }}
                type="text" value={this._currPositionVertical}
                onChange={e => this._currPositionVertical = e.target.value}
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
            </button>
        </>;
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