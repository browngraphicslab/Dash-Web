import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { observable, action, computed } from "mobx";
import "./InkOptionsMenu.scss";
import { ActiveInkColor, ActiveFillColor, SetActiveInkWidth, SetActiveInkColor, SetActiveBezierApprox, SetActiveFillColor, SetActiveArrowStart, SetActiveArrowEnd, ActiveDash, SetActiveDash } from "../../InkingStroke";
import { Scripting } from "../../../util/Scripting";
import { InkTool } from "../../../../fields/InkField";
import { ColorState } from "react-color";
import { Utils } from "../../../../Utils";
import GestureOverlay from "../../GestureOverlay";
import { Doc } from "../../../../fields/Doc";
import { SelectionManager } from "../../../util/SelectionManager";
import { DocumentView } from "../../../views/nodes/DocumentView";
import { Document } from "../../../../fields/documentSchemas";
import { DocumentType } from "../../../documents/DocumentTypes";
import { FontAwesomeIcon, FontAwesomeIconProps } from "@fortawesome/react-fontawesome";
import { BoolCast } from "../../../../fields/Types";
import FormatShapePane from "./FormatShapePane";

@observer
export default class InkOptionsMenu extends AntimodeMenu {
    static Instance: InkOptionsMenu;

    private _palette = ["#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321", "#417505", "#9013FE", "#4A90E2", "#50E3C2", "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF", ""];
    private _width = ["1", "5", "10", "100"];
    private _draw = ["⎯", "→", "↔︎", "∿", "↝", "↭", "ロ", "O", "∆"];
    private _head = ["", "", "arrow", "", "", "arrow", "", "", ""];
    private _end = ["", "arrow", "arrow", "", "arrow", "arrow", "", "", ""];
    private _shape = ["line", "line", "line", "", "", "", "rectangle", "circle", "triangle"];

    @observable _shapesNum = this._shape.length;
    @observable _selected = this._shapesNum;

    @observable _collapsed = false;
    @observable _keepMode = false;

    @observable _colorBtn = false;
    @observable _widthBtn = false;
    @observable _fillBtn = false;

    constructor(props: Readonly<{}>) {
        super(props);
        InkOptionsMenu.Instance = this;
        this._canFade = false; // don't let the inking menu fade away
        this.Pinned = BoolCast(Doc.UserDoc()["menuInkOptions-pinned"]);
    }

    @action
    toggleMenuPin = (e: React.MouseEvent) => {
        Doc.UserDoc()["menuInkOptions-pinned"] = this.Pinned = !this.Pinned;
    }

    @action
    changeColor = (color: string, type: string) => {
        const col: ColorState = {
            hex: color, hsl: { a: 0, h: 0, s: 0, l: 0, source: "" }, hsv: { a: 0, h: 0, s: 0, v: 0, source: "" },
            rgb: { a: 0, r: 0, b: 0, g: 0, source: "" }, oldHue: 0, source: "",
        };
        if (type === "color") {
            SetActiveInkColor(Utils.colorString(col));
        } else if (type === "fill") {
            SetActiveFillColor(Utils.colorString(col));
        }
    }

    @action
    editProperties = (value: any, field: string) => {
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK) {
                switch (field) {
                    case "width": doc.strokeWidth = Number(value); break;
                    case "color": doc.color = String(value); break;
                    case "fill": doc.fillColor = String(value); break;
                    case "dash": doc.strokeDash = value;
                }
            }
        }));
    }

    @computed get drawButtons() {
        const func = action((i: number, keep: boolean) => {
            this._keepMode = keep;
            if (this._selected !== i) {
                this._selected = i;
                Doc.SetSelectedTool(InkTool.Pen);
                SetActiveArrowStart(this._head[i]);
                SetActiveArrowEnd(this._end[i]);
                SetActiveBezierApprox("300");

                GestureOverlay.Instance.InkShape = this._shape[i];
            } else {
                this._selected = this._shapesNum;
                Doc.SetSelectedTool(InkTool.None);
                SetActiveArrowStart("");
                SetActiveArrowEnd("");
                GestureOverlay.Instance.InkShape = "";
                SetActiveBezierApprox("0");
            }
        });
        return <div className="btn-draw" key="draw">
            {this._draw.map((icon, i) =>
                <button className="antimodeMenu-button" key={icon} onPointerDown={() => func(i, false)} onDoubleClick={() => func(i, true)}
                    style={{ backgroundColor: i === this._selected ? "121212" : "", fontSize: "20" }}>
                    {this._draw[i]}
                </button>)}
        </div>;
    }

    toggleButton = (key: string, value: boolean, setter: () => {}, icon: FontAwesomeIconProps["icon"], ele: JSX.Element | null) => {
        return <button className="antimodeMenu-button" key={key} title={key}
            onPointerDown={action(e => setter())}
            style={{ backgroundColor: value ? "121212" : "" }}>
            <FontAwesomeIcon icon={icon} size="lg" />
            {ele}
        </button>;
    }

    @computed get widthPicker() {
        var widthPicker = this.toggleButton("stroke width", this._widthBtn, () => this._widthBtn = !this._widthBtn, "bars", null);
        return !this._widthBtn ? widthPicker :
            <div className="btn2-group" key="width">
                {widthPicker}
                {this._width.map(wid =>
                    <button className="antimodeMenu-button" key={wid}
                        onPointerDown={action(() => { SetActiveInkWidth(wid); this._widthBtn = false; this.editProperties(wid, "width"); })}
                        style={{ backgroundColor: this._widthBtn ? "121212" : "", zIndex: 1001 }}>
                        {wid}
                    </button>)}
            </div>;
    }

    @computed get colorPicker() {
        var colorPicker = this.toggleButton("stroke color", this._colorBtn, () => this._colorBtn = !this._colorBtn, "pen-nib",
            <div className="color-previewI" style={{ backgroundColor: ActiveInkColor() ?? "121212" }} />);
        return !this._colorBtn ? colorPicker :
            <div className="btn-group" key="color">
                {colorPicker}
                {this._palette.map(color =>
                    <button className="antimodeMenu-button" key={color}
                        onPointerDown={action(() => { this.changeColor(color, "color"); this._colorBtn = false; this.editProperties(color, "color"); })}
                        style={{ backgroundColor: this._colorBtn ? "121212" : "", zIndex: 1001 }}>
                        {/* <FontAwesomeIcon icon="pen-nib" size="lg" /> */}
                        <div className="color-previewII" style={{ backgroundColor: color }} />
                    </button>)}
            </div>;
    }
    @computed get fillPicker() {
        var fillPicker = this.toggleButton("shape fill color", this._fillBtn, () => this._fillBtn = !this._fillBtn, "fill-drip",
            <div className="color-previewI" style={{ backgroundColor: ActiveFillColor() ?? "121212" }} />);
        return !this._fillBtn ? fillPicker :
            <div className="btn-group" key="fill" >
                {fillPicker}
                {this._palette.map(color =>
                    <button className="antimodeMenu-button" key={color}
                        onPointerDown={action(() => { this.changeColor(color, "fill"); this._fillBtn = false; this.editProperties(color, "fill"); })}
                        style={{ backgroundColor: this._fillBtn ? "121212" : "", zIndex: 1001 }}>
                        <div className="color-previewII" style={{ backgroundColor: color }}></div>
                    </button>)}

            </div>;
    }

    @computed get formatPane() {
        return <button className="antimodeMenu-button" key="format" title="toggle foramatting pane"
            onPointerDown={action(e => FormatShapePane.Instance.Pinned = !FormatShapePane.Instance.Pinned)}
            style={{ backgroundColor: this._fillBtn ? "121212" : "" }}>
            <FontAwesomeIcon icon="chevron-right" size="lg" />
        </button>;
    }

    render() {
        return this.getElement([
            this.widthPicker,
            this.colorPicker,
            this.fillPicker,
            this.drawButtons,
            this.formatPane,
            <button className="antimodeMenu-button" key="pin menu" title="Pin menu" onClick={this.toggleMenuPin} style={{ backgroundColor: this.Pinned ? "#121212" : "", display: this._collapsed ? "none" : undefined }}>
                <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.Pinned ? 45 : 0}deg)` }} />
            </button>
        ]);
    }
}
Scripting.addGlobal(function activatePen(penBtn: any) {
    if (penBtn) {
        InkOptionsMenu.Instance.jumpTo(300, 300);
        InkOptionsMenu.Instance.Pinned = true;
    } else {
        InkOptionsMenu.Instance.Pinned = false;
        InkOptionsMenu.Instance.fadeOut(true);
    }
});
