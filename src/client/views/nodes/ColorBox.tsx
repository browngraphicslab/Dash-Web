import React = require("react");
import { action } from "mobx";
import { observer } from "mobx-react";
import { ColorState, SketchPicker } from 'react-color';
import { Doc } from "../../../fields/Doc";
import { Utils } from "../../../Utils";
import { documentSchema } from "../../../fields/documentSchemas";
import { InkTool } from "../../../fields/InkField";
import { makeInterface } from "../../../fields/Schema";
import { StrCast } from "../../../fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { ViewBoxBaseComponent } from "../DocComponent";
import { ActiveInkPen, ActiveInkWidth, ActiveInkBezierApprox, SetActiveInkColor, SetActiveInkWidth, SetActiveBezierApprox } from "../InkingStroke";
import "./ColorBox.scss";
import { FieldView, FieldViewProps } from './FieldView';
import { DocumentType } from "../../documents/DocumentTypes";
import { RichTextMenu } from "./formattedText/RichTextMenu";

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends ViewBoxBaseComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ColorBox, fieldKey); }

    @undoBatch
    @action
    static switchColor(color: ColorState) {
        Doc.UserDoc().backgroundColor = Utils.colorString(color);
        SetActiveInkColor(color.hex);

        if (Doc.GetSelectedTool() === InkTool.None) {
            const selected = SelectionManager.SelectedDocuments();
            selected.map(view => {
                const targetDoc = view.props.Document.dragFactory instanceof Doc ? view.props.Document.dragFactory :
                    view.props.Document.layout instanceof Doc ? view.props.Document.layout :
                        view.props.Document.isTemplateForField ? view.props.Document : Doc.GetProto(view.props.Document);
                if (targetDoc) {
                    if (view.props.LayoutTemplate?.() || view.props.LayoutTemplateString) {  // this situation typically occurs when you have a link dot 
                        targetDoc.backgroundColor = Doc.UserDoc().backgroundColor;  // bcz: don't know how to change the color of an inline template...
                    }
                    else if (RichTextMenu.Instance?.TextViewFieldKey && window.getSelection()?.toString() !== "") {
                        Doc.Layout(view.props.Document)[RichTextMenu.Instance.TextViewFieldKey + "-color"] = Doc.UserDoc().backgroundColor;
                    } else {
                        Doc.Layout(view.props.Document)._backgroundColor = Doc.UserDoc().backgroundColor; // '_backgroundColor' is template specific.  'backgroundColor' would apply to all templates, but has no UI at the moment
                    }
                }
            });
        }
    }

    constructor(props: any) {
        super(props);
    }
    render() {
        const selDoc = SelectionManager.SelectedDocuments()?.[0]?.rootDoc;
        return <div className={`colorBox-container${this.active() ? "-interactive" : ""}`}
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()} onClick={e => { (e.nativeEvent as any).stuff = true; e.stopPropagation(); }}
            style={{ transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >

            <SketchPicker onChange={ColorBox.switchColor} presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF', '#f1efeb', 'transparent']}
                color={StrCast(ActiveInkPen()?.backgroundColor,
                    StrCast(selDoc?._backgroundColor, StrCast(selDoc?.backgroundColor, "black")))} />

            <div style={{ display: "grid", gridTemplateColumns: "20% 80%", paddingTop: "10px" }}>
                <div> {ActiveInkWidth() ?? 2}</div>
                <input type="range" defaultValue={ActiveInkWidth() ?? 2} min={1} max={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    SetActiveInkWidth(e.target.value);
                    SelectionManager.SelectedDocuments().filter(i => StrCast(i.rootDoc.type) === DocumentType.INK).map(i => i.rootDoc.strokeWidth = Number(e.target.value));
                }} />
                {/* <div> {ActiveInkBezierApprox() ?? 2}</div>
                <input type="range" defaultValue={ActiveInkBezierApprox() ?? 2} min={0} max={300} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    SetActiveBezierApprox(e.target.value);
                    SelectionManager.SelectedDocuments().filter(i => StrCast(i.rootDoc.type) === DocumentType.INK).map(i => i.rootDoc.strokeBezier = e.target.value);
                }} /> */}
                <br />
                <br />
            </div>
        </div>;
    }
}
