import React = require("react");
import { action } from "mobx";
import { observer } from "mobx-react";
import { ColorState, SketchPicker } from 'react-color';
import { Doc, HeightSym, WidthSym } from '../../../fields/Doc';
import { documentSchema } from "../../../fields/documentSchemas";
import { InkTool } from "../../../fields/InkField";
import { makeInterface } from "../../../fields/Schema";
import { StrCast } from "../../../fields/Types";
import { DocumentType } from "../../documents/DocumentTypes";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { ViewBoxBaseComponent } from "../DocComponent";
import { ActiveInkColor, ActiveInkWidth, SetActiveInkColor, SetActiveInkWidth } from "../InkingStroke";
import "./ColorBox.scss";
import { FieldView, FieldViewProps } from './FieldView';
import { RichTextMenu } from "./formattedText/RichTextMenu";

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends ViewBoxBaseComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ColorBox, fieldKey); }

    @undoBatch
    @action
    static switchColor(color: ColorState) {
        // Doc.UserDoc().backgroundColor = Utils.colorString(color); // bcz: this can't go here ... needs a proper home in the settings panel
        SetActiveInkColor(color.hex);

        SelectionManager.Views().map(view => {
            const targetDoc = view.props.Document.dragFactory instanceof Doc ? view.props.Document.dragFactory :
                view.props.Document.layout instanceof Doc ? view.props.Document.layout :
                    view.props.Document.isTemplateForField ? view.props.Document : Doc.GetProto(view.props.Document);
            if (targetDoc) {
                if (view.props.LayoutTemplate?.() || view.props.LayoutTemplateString) {  // this situation typically occurs when you have a link dot 
                    targetDoc.backgroundColor = color.hex;  // bcz: don't know how to change the color of an inline template...
                }
                else if (RichTextMenu.Instance?.TextViewFieldKey && window.getSelection()?.toString() !== "") {
                    Doc.Layout(view.props.Document)[RichTextMenu.Instance.TextViewFieldKey + "-color"] = color.hex;
                } else {
                    Doc.Layout(view.props.Document)._backgroundColor = color.hex + (color.rgb.a ? Math.round(color.rgb.a * 256).toString(16) : ""); // '_backgroundColor' is template specific.  'backgroundColor' would apply to all templates, but has no UI at the moment
                }
            }
        });
    }

    render() {
        const scaling = Math.min(this.layoutDoc.fitWidth ? 10000 : this.props.PanelHeight() / this.rootDoc[HeightSym](), this.props.PanelWidth() / this.rootDoc[WidthSym]());
        return <div className={`colorBox-container${this.isContentActive() ? "-interactive" : ""}`}
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()} onClick={e => e.stopPropagation()}
            style={{ transform: `scale(${scaling})`, width: `${100 * scaling}%`, height: `${100 * scaling}%` }} >

            <SketchPicker
                onChange={c => CurrentUserUtils.SelectedTool === InkTool.None && ColorBox.switchColor(c)}
                color={StrCast(SelectionManager.Views()?.[0]?.rootDoc?._backgroundColor, ActiveInkColor())}
                presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986',
                    '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF', '#f1efeb', 'transparent']}
            />

            <div style={{ width: this.props.PanelWidth() / scaling, display: "flex", paddingTop: "10px" }}>
                <div> {ActiveInkWidth()}</div>
                <input type="range" defaultValue={ActiveInkWidth()} min={1} max={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    SetActiveInkWidth(e.target.value);
                    SelectionManager.Views().filter(i => StrCast(i.rootDoc.type) === DocumentType.INK).map(i => i.rootDoc.strokeWidth = Number(e.target.value));
                }} />
            </div>
        </div>;
    }
}
