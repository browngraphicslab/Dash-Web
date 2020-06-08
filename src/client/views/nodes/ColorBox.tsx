import React = require("react");
import { observer } from "mobx-react";
import { SketchPicker, ColorState } from 'react-color';
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface } from "../../../fields/Schema";
import { StrCast } from "../../../fields/Types";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { SelectionManager } from "../../util/SelectionManager";
import { ViewBoxBaseComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import "./ColorBox.scss";
import { FieldView, FieldViewProps } from './FieldView';
import { InkingStroke } from "../InkingStroke";
import { Doc } from "../../../fields/Doc";
import { InkTool } from "../../../fields/InkField";
import { undoBatch } from "../../util/UndoManager";
import { action } from "mobx";
import { FormattedTextBox } from "./formattedText/FormattedTextBox";

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends ViewBoxBaseComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ColorBox, fieldKey); }

    static decimalToHexString(number: number) {
        if (number < 0) {
            number = 0xFFFFFFFF + number + 1;
        }
        return (number < 16 ? "0" : "") + number.toString(16).toUpperCase();
    }

    @undoBatch
    @action
    static switchColor(color: ColorState) {
        Doc.UserDoc().backgroundColor = color.hex.startsWith("#") ?
            color.hex + (color.rgb.a ? ColorBox.decimalToHexString(Math.round(color.rgb.a * 255)) : "ff") : color.hex;
        InkingStroke.InkColor = StrCast(Doc.UserDoc().backgroundColor);
        CurrentUserUtils.ActivePen && (CurrentUserUtils.ActivePen.inkColor = color.hex);

        if (Doc.selectedTool === InkTool.None) {
            const selected = SelectionManager.SelectedDocuments();
            selected.map(view => {
                const targetDoc = view.props.Document.dragFactory instanceof Doc ? view.props.Document.dragFactory :
                    view.props.Document.layout instanceof Doc ? view.props.Document.layout :
                        view.props.Document.isTemplateForField ? view.props.Document : Doc.GetProto(view.props.Document);
                if (targetDoc) {
                    if (StrCast(Doc.Layout(view.props.Document).layout).indexOf("FormattedTextBox") !== -1 && FormattedTextBox.HadSelection) {
                        Doc.Layout(view.props.Document).color = Doc.UserDoc().bacgroundColor;
                    } else {
                        Doc.Layout(view.props.Document)._backgroundColor = Doc.UserDoc().backgroundColor; // '_backgroundColor' is template specific.  'backgroundColor' would apply to all templates, but has no UI at the moment
                    }
                }
            });
        }
    }

    render() {
        const selDoc = SelectionManager.SelectedDocuments()?.[0]?.rootDoc;
        return <div className={`colorBox-container${this.active() ? "-interactive" : ""}`}
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()}
            style={{ transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >

            <SketchPicker onChange={ColorBox.switchColor} presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF', '#f1efeb', 'transparent']}
                color={StrCast(CurrentUserUtils.ActivePen ? CurrentUserUtils.ActivePen.backgroundColor : undefined,
                    StrCast(selDoc?._backgroundColor, StrCast(selDoc?.backgroundColor, "black")))} />
            <div style={{ display: "grid", gridTemplateColumns: "20% 80%", paddingTop: "10px" }}>
                <div> {InkingStroke.InkWidth ?? 2}</div>
                <input type="range" value={InkingStroke.InkWidth ?? 2} defaultValue={2} min={1} max={100} onChange={(e: React.ChangeEvent<HTMLInputElement>) => InkingControl.Instance.switchWidth(e.target.value)} />
                <div> {InkingStroke.InkBezierApprox ?? 2}</div>
                <input type="range" value={InkingStroke.InkBezierApprox ?? 2} defaultValue={2} min={0} max={300} onChange={(e: React.ChangeEvent<HTMLInputElement>) => InkingControl.Instance.switchBezier(e.target.value)} />
                <br />
                <br />
            </div>
        </div>;
    }
} 