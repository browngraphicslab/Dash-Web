import React = require("react");
import { observer } from "mobx-react";
import { SketchPicker } from 'react-color';
import { FieldView, FieldViewProps } from './FieldView';
import "./ColorBox.scss";
import { InkingControl } from "../InkingControl";
import { DocStaticComponent } from "../DocComponent";
import { documentSchema } from "./DocumentView";
import { makeInterface } from "../../../new_fields/Schema";

type ColorDocument = makeInterface<[typeof documentSchema]>;
const ColorDocument = makeInterface(documentSchema);

@observer
export class ColorBox extends DocStaticComponent<FieldViewProps, ColorDocument>(ColorDocument) {
    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(ColorBox, fieldKey); }
    render() {
        return <div className={`colorBox-container${this.active() ? "-interactive" : ""}`} onPointerDown={e => e.button === 0 && !e.ctrlKey && e.stopPropagation()}>
            <SketchPicker color={InkingControl.Instance.selectedColor} onChange={InkingControl.Instance.switchColor} />
        </div>;
    }
} 