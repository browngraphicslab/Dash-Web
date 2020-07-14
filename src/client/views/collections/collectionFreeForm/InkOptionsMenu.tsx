import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { observable, action, computed } from "mobx";
import "./InkOptionsMenu.scss";
import { ActiveInkColor, ActiveInkBezierApprox, ActiveFillColor, ActiveArrowStart, ActiveArrowEnd, SetActiveInkWidth, SetActiveInkColor, SetActiveBezierApprox, SetActiveFillColor, SetActiveArrowStart, SetActiveArrowEnd, ActiveDash, SetActiveDash } from "../../InkingStroke";
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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faBold, faItalic, faChevronLeft, faUnderline, faStrikethrough, faSubscript, faSuperscript, faIndent, faEyeDropper, faCaretDown, faPalette, faArrowsAlt, faHighlighter, faLink, faPaintRoller, faSleigh, faBars, faFillDrip, faBrush, faPenNib, faShapes, faArrowLeft, faEllipsisH, faBezierCurve, } from "@fortawesome/free-solid-svg-icons";
import { Cast, StrCast, BoolCast } from "../../../../fields/Types";
import FormatShapePane from "./FormatShapePane";

library.add(faBold, faItalic, faChevronLeft, faUnderline, faStrikethrough, faSuperscript, faSubscript, faIndent, faEyeDropper, faCaretDown, faPalette, faArrowsAlt, faHighlighter, faLink, faPaintRoller, faBars, faFillDrip, faBrush, faPenNib, faShapes, faArrowLeft, faEllipsisH, faBezierCurve);



@observer
export default class InkOptionsMenu extends AntimodeMenu {
    static Instance: InkOptionsMenu;

    private _palette = ["#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321", "#417505", "#9013FE", "#4A90E2", "#50E3C2", "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF", ""];
    private _width = ["1", "5", "10", "100"];
    // private _buttons = ["circle", "triangle", "rectangle", "arrow", "line"];
    // private _icons = ["O", "∆", "ロ", "➜", "-"];
    // private _buttons = ["circle", "triangle", "rectangle", "line", "noRec", "",];
    // private _icons = ["O", "∆", "ロ", "⎯⎯⎯", "✖︎", " "];
    //arrowStart and arrowEnd must match and defs must exist in Inking Stroke
    // private _arrowStart = ["arrowStart", "arrowStart", "dot", "dot", "none"];
    // private _arrowEnd = ["none", "arrowEnd", "none", "dot", "none"];
    // private _arrowIcons = ["→", "↔︎", "•", "••", " "];
    private _draw = ["⎯", "→", "↔︎", "∿", "↝", "↭", "ロ", "O", "∆"];
    private _head = ["", "", "arrow", "", "", "arrow", "", "", ""];
    private _end = ["", "arrow", "arrow", "", "arrow", "arrow", "", "", ""];
    private _shape = ["line", "line", "line", "", "", "", "rectangle", "circle", "triangle"];

    @observable _shapesNum = this._shape.length;
    @observable _selected = this._shapesNum;

    @observable private collapsed: boolean = false;
    @observable _double = "";

    @observable _colorBtn = false;
    @observable _widthBtn = false;
    @observable _fillBtn = false;
    // @observable _arrowBtn = false;
    // @observable _dashBtn = false;
    // @observable _shapeBtn = false;



    constructor(props: Readonly<{}>) {
        super(props);
        InkOptionsMenu.Instance = this;
        this._canFade = false; // don't let the inking menu fade away
        this.Pinned = BoolCast(Doc.UserDoc()["menuInkOptions-pinned"]);

    }

    @action
    toggleMenuPin = (e: React.MouseEvent) => {
        Doc.UserDoc()["menuInkOptions-pinned"] = this.Pinned = !this.Pinned;
        if (!this.Pinned) {
            // this.fadeOut(true);
        }
    }

    @action
    protected toggleCollapse = (e: React.MouseEvent) => {
        this.collapsed = !this.collapsed;
        setTimeout(() => {
            const x = Math.min(this._left, window.innerWidth - InkOptionsMenu.Instance.width);
            InkOptionsMenu.Instance.jumpTo(x, this._top, true);
        }, 0);
    }




    getColors = () => {
        return this._palette;
    }

    // @action
    // changeArrow = (arrowStart: string, arrowEnd: string) => {
    //     SetActiveArrowStart(arrowStart);
    //     SetActiveArrowEnd(arrowEnd);
    // }

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
                    case "width":
                        doc.strokeWidth = Number(value);
                        break;
                    case "color":
                        doc.color = String(value);
                        break;
                    case "fill":
                        doc.fillColor = String(value);
                        break;
                    case "bezier":
                        // doc.strokeBezier === 300 ? doc.strokeBezier = 0 : doc.strokeBezier = 300;
                        break;
                    case "dash":
                        doc.strokeDash = value;
                    default:
                        break;
                }
            }
        }));
    }


    @action
    changeBezier = (e: React.PointerEvent): void => {
        SetActiveBezierApprox(!ActiveInkBezierApprox() ? "300" : "");
        this.editProperties(0, "bezier");
    }
    @action
    changeDash = (e: React.PointerEvent): void => {
        SetActiveDash(ActiveDash() === "0" ? "2" : "0");
        this.editProperties(ActiveDash(), "strokeDash");
    }

    @computed get drawButtons() {
        const drawButtons = <div className="btn-draw" key="draw">
            {this._draw.map((icon, i) => {
                return <button
                    className="antimodeMenu-button"
                    key={icon}
                    onPointerDown={action(() => {
                        this._double = "";

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
                        console.log(this._selected);

                    })}
                    onDoubleClick={action(() => {
                        console.log("double");
                        this._double = this._draw[i];
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



                    })}
                    style={{ backgroundColor: i === this._selected ? "121212" : "", fontSize: "20" }}>
                    {this._draw[i]}
                </button>;
            })}</div>;
        return drawButtons;
    }

    // @computed get arrowPicker() {
    //     var currIcon;
    //     for (var i = 0; i < this._arrowStart.length; i++) {
    //         if (this._arrowStart[i] === ActiveArrowStart() && this._arrowEnd[i] === ActiveArrowEnd()) {
    //             currIcon = this._arrowIcons[i];
    //             if (this._arrowIcons[i] === " ") {
    //                 currIcon = "➤";
    //             }
    //         }
    //     }
    //     var arrowPicker = <button
    //         className="antimodeMenu-button"
    //         key="arrow"
    //         onPointerDown={action(e => this._arrowBtn = !this._arrowBtn)}
    //         style={{ backgroundColor: this._arrowBtn ? "121212" : "" }}>
    //         {currIcon}
    //     </button>;
    //     if (this._arrowBtn) {
    //         arrowPicker = <div className="btn2-group" key="arrows">
    //             {arrowPicker}
    //             {this._arrowStart.map((arrowStart, i) => {
    //                 return <button
    //                     className="antimodeMenu-button"
    //                     key={arrowStart}
    //                     onPointerDown={action(() => { SetActiveArrowStart(arrowStart); SetActiveArrowEnd(this._arrowEnd[i]); this.editProperties(arrowStart, "arrowStart"), this.editProperties(this._arrowEnd[i], "arrowEnd"); this._arrowBtn = false; })}
    //                     style={{ backgroundColor: this._arrowBtn ? "121212" : "" }}>
    //                     {this._arrowIcons[i]}
    //                 </button>;
    //             })}
    //         </div>;
    //     }
    //     return arrowPicker;
    // }

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
                        style={{ backgroundColor: this._widthBtn ? "121212" : "", zIndex: 1001 }}>
                        {wid}
                    </button>;
                })}
            </div>;
        }
        return widthPicker;
    }



    @computed get colorPicker() {
        var colorPicker = <button
            className="antimodeMenu-button"
            key="color"
            title="colorChanger"
            onPointerDown={action(e => this._colorBtn = !this._colorBtn)}
            style={{ backgroundColor: this._colorBtn ? "121212" : "" }}>
            <FontAwesomeIcon icon="pen-nib" size="lg" />
            <div className="color-previewI" style={{ backgroundColor: ActiveInkColor() ?? "121212" }}></div>

        </button>;
        if (this._colorBtn) {
            colorPicker = <div className="btn-group" key="color">
                {colorPicker}
                {this._palette.map(color => {
                    return <button
                        className="antimodeMenu-button"
                        key={color}
                        onPointerDown={action(() => { this.changeColor(color, "color"); this._colorBtn = false; this.editProperties(color, "color"); })}
                        style={{ backgroundColor: this._colorBtn ? "121212" : "", zIndex: 1001 }}>
                        {/* <FontAwesomeIcon icon="pen-nib" size="lg" /> */}
                        <div className="color-previewII" style={{ backgroundColor: color }}></div>
                    </button>;
                })}
            </div>;
        }
        return colorPicker;
    }
    @computed get formatPane() {
        return <button className="antimodeMenu-button" key="format"
            title="toggle foramatting pane"
            onPointerDown={action(e => FormatShapePane.Instance.Pinned = !FormatShapePane.Instance.Pinned)}
            style={{ backgroundColor: this._fillBtn ? "121212" : "" }}>
            <FontAwesomeIcon icon="chevron-right" size="lg" />
        </button>;
    }

    @computed get fillPicker() {
        var fillPicker = <button
            className="antimodeMenu-button"
            key="fill"
            title="fillChanger"
            onPointerDown={action(e => this._fillBtn = !this._fillBtn)}
            style={{ backgroundColor: this._fillBtn ? "121212" : "" }}>
            <FontAwesomeIcon icon="fill-drip" size="lg" />
            <div className="color-previewI" style={{ backgroundColor: ActiveFillColor() ?? "121212" }}></div>
        </button>;
        if (this._fillBtn) {
            fillPicker = <div className="btn-group" key="fill" >
                {fillPicker}
                {this._palette.map(color => {
                    return <button
                        className="antimodeMenu-button"
                        key={color}
                        onPointerDown={action(() => { this.changeColor(color, "fill"); this._fillBtn = false; this.editProperties(color, "fill"); })}
                        style={{ backgroundColor: this._fillBtn ? "121212" : "", zIndex: 1001 }}>
                        <div className="color-previewII" style={{ backgroundColor: color }}></div>
                    </button>;
                })}

            </div>;
        }
        return fillPicker;
    }

    // @computed get shapePicker() {
    //     var currIcon;
    //     if (GestureOverlay.Instance.InkShape === "") {
    //         currIcon = <FontAwesomeIcon icon="shapes" size="lg" />;
    //     } else {
    //         for (var i = 0; i < this._icons.length; i++) {
    //             if (GestureOverlay.Instance.InkShape === this._buttons[i]) {
    //                 currIcon = this._icons[i];
    //             }
    //         }
    //     }
    //     var shapePicker = <button
    //         className="antimodeMenu-button"
    //         key="shape"
    //         onPointerDown={action(e => this._shapeBtn = !this._shapeBtn)}
    //         style={{ backgroundColor: this._shapeBtn ? "121212" : "" }}>
    //         {currIcon}
    //     </button>;
    //     if (this._shapeBtn) {
    //         shapePicker = <div className="btn2-group" key="shape">
    //             {shapePicker}
    //             {this._buttons.map((btn, i) => {
    //                 var ttl = btn;
    //                 if (btn === "") {
    //                     ttl = "no shape";
    //                 }
    //                 if (btn === "noRec") {
    //                     ttl = "disable shape recognition";
    //                 }
    //                 return <button
    //                     className="antimodeMenu-button"
    //                     title={`Draw ${btn}`}
    //                     key={ttl}
    //                     onPointerDown={action((e) => { GestureOverlay.Instance.InkShape = btn; this._shapeBtn = false; })}
    //                     style={{ backgroundColor: this._shapeBtn ? "121212" : "", fontSize: "20" }}>
    //                     {this._icons[i]}
    //                 </button>;
    //             })}
    //         </div>;
    //     }
    //     return shapePicker;
    // }

    @computed get bezierButton() {
        return <button
            className="antimodeMenu-button"
            title="Bezier changer"
            key="bezier"
            onPointerDown={e => this.changeBezier(e)}
            style={{ backgroundColor: ActiveInkBezierApprox() ? "121212" : "" }}>
            <FontAwesomeIcon icon="bezier-curve" size="lg" />

        </button>;
    }

    @computed get dashButton() {
        return <button
            className="antimodeMenu-button"
            title="dash changer"
            key="dash"
            onPointerDown={e => this.changeDash(e)}
            style={{ backgroundColor: ActiveDash() !== "0" ? "121212" : "" }}>
            <FontAwesomeIcon icon="ellipsis-h" size="lg" />

        </button>;
    }

    render() {
        const buttons = [
            // <button className="antimodeMenu-button" title="Drag" key="drag" onPointerDown={e => this.dragStart(e)}>
            //     <FontAwesomeIcon icon="arrows-alt" size="lg" />
            // </button>,
            // this.shapePicker,
            // this.bezierButton,
            this.widthPicker,
            this.colorPicker,
            this.fillPicker,
            this.drawButtons,
            this.formatPane,
            // this.arrowPicker,
            // this.dashButton,
            <button className="antimodeMenu-button" key="pin menu" title="Pin menu" onClick={this.toggleMenuPin} style={{ backgroundColor: this.Pinned ? "#121212" : "", display: this.collapsed ? "none" : undefined }}>
                <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.Pinned ? 45 : 0}deg)` }} />
            </button>
        ];

        // return this.getElement(buttons);
        return this.getElement(buttons);
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
