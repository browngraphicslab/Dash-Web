import React = require("react");
import { observer } from "mobx-react";
import { SketchPicker } from 'react-color';
import { documentSchema } from "../../../new_fields/documentSchemas";
import { makeInterface } from "../../../new_fields/Schema";
import { StrCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { SelectionManager } from "../../util/SelectionManager";
import { ViewBoxBaseComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import "./ColorBox.scss";
import { FieldView, FieldViewProps } from './FieldView';

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends ViewBoxBaseComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ColorBox, fieldKey); }

    render() {
        const selDoc = SelectionManager.SelectedDocuments()?.[0]?.rootDoc;
        return <div className={`colorBox-container${this.active() ? "-interactive" : ""}`}
            onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()}
            style={{ transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >

            <SketchPicker onChange={InkingControl.Instance.switchColor} presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF', '#f1efeb', 'transparent']}
                color={StrCast(CurrentUserUtils.ActivePen ? CurrentUserUtils.ActivePen.backgroundColor : undefined,
                    StrCast(selDoc?._backgroundColor, StrCast(selDoc?.backgroundColor, "black")))} />
        </div>;
    }
} 