import React = require("react");
import { observer } from "mobx-react";
import { SketchPicker } from 'react-color';
import { FieldView, FieldViewProps } from './FieldView';
import "./ColorBox.scss";
import { InkingControl } from "../InkingControl";

@observer
export class ColorBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(ColorBox, fieldKey); }
    render() {
        return <div className="colorBox-container" >
            <SketchPicker color={InkingControl.Instance.selectedColor} onChange={InkingControl.Instance.switchColor} />
        </div>;
    }
}